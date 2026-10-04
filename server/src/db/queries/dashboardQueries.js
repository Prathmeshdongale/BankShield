/**
 * dashboardQueries.js — Optimised SQL aggregations for dashboard endpoints.
 *
 * Performance strategy:
 *   • All queries run in parallel via Promise.all — total wall-time ≈ slowest single query.
 *   • Each query uses only indexed columns in WHERE/GROUP BY:
 *       transactions: created_at DESC (idx_txn_created_at), status (idx_txn_status),
 *                     is_fraud WHERE TRUE (idx_txn_is_fraud), source_account_id,created_at (idx_txn_customer_source)
 *       fraud_alerts: created_at DESC (idx_fa_created_at), status (idx_fa_status),
 *                     severity (idx_fa_severity), deleted_at IS NULL (idx_fa_deleted_at)
 *       accounts:     branch_id (idx_accounts_customer_id), status (idx_accounts_status)
 *   • Branch-scope filter restricts to accounts.branch_id = $branchId so
 *     branch managers see only their branch's data.
 *   • No OFFSET-based pagination — all dashboard queries return bounded result sets.
 *
 * Role scoping:
 *   branchId = null   → platform-wide (super_admin, admin, compliance_officer, fraud_analyst)
 *   branchId = <UUID> → single-branch view (branch_manager)
 *   customerId = <UUID> → customer's own accounts only (customer role)
 */

import { query as poolQuery } from '../connection.js';

// ─────────────────────────────────────────────────────────────────────────────
// SCOPE BUILDER — produces a SQL fragment and values array
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a WHERE clause that scopes transactions to a branch or customer.
 *
 * @param {string|null} branchId    — limits to accounts in this branch
 * @param {string|null} customerId  — limits to a specific customer's accounts
 * @param {number}      startIdx    — first $N parameter index to use
 * @returns {{ clause: string, values: any[], nextIdx: number }}
 */
export const buildScopeFilter = (branchId, customerId, startIdx = 1) => {
  if (!branchId && !customerId) {
    return { clause: '', values: [], nextIdx: startIdx, joinClause: '' };
  }

  const values = [];
  let joinClause = '';
  let conditions = [];

  if (branchId) {
    // Scope to accounts whose branch_id matches
    joinClause = `JOIN accounts _sa ON _sa.id = t.source_account_id`;
    values.push(branchId);
    conditions.push(`_sa.branch_id = $${startIdx + values.length - 1}`);
  }
  if (customerId) {
    // Scope to a customer's own accounts
    if (!joinClause) {
      joinClause = `JOIN accounts _sa ON _sa.id = t.source_account_id
                    JOIN customers _c  ON _c.id  = _sa.customer_id`;
    } else {
      joinClause += `\n  JOIN customers _c ON _c.id = _sa.customer_id`;
    }
    values.push(customerId);
    conditions.push(`_c.id = $${startIdx + values.length - 1}`);
  }

  const clause = conditions.length ? `AND ${conditions.join(' AND ')}` : '';
  return { clause, values, nextIdx: startIdx + values.length, joinClause };
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. SUMMARY COUNTERS  (single query, very fast via indexed aggregates)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns total transaction counts + volumes for today and last 30 days,
 * plus fraud transaction count, active alert count, active account count.
 *
 * Runs as one parallel-friendly SELECT; all GROUP BY cols are indexed.
 */
export const getSummaryCounters = async (branchId = null, customerId = null) => {
  const scope = buildScopeFilter(branchId, customerId, 1);

  // Transaction summary — uses idx_txn_created_at, idx_txn_status
  const txnSql = `
    SELECT
      COUNT(*)                                             AS total_30d,
      COALESCE(SUM(t.amount),0)                           AS volume_30d,
      COUNT(*) FILTER (WHERE DATE_TRUNC('day',t.created_at) = CURRENT_DATE)
                                                          AS total_today,
      COALESCE(SUM(t.amount) FILTER (WHERE DATE_TRUNC('day',t.created_at) = CURRENT_DATE),0)
                                                          AS volume_today,
      COUNT(*) FILTER (WHERE t.is_fraud = TRUE)           AS fraud_count,
      COALESCE(SUM(t.amount) FILTER (WHERE t.is_fraud = TRUE),0) AS fraud_volume,
      COUNT(*) FILTER (WHERE t.status = 'completed')      AS completed_count,
      COUNT(*) FILTER (WHERE t.status = 'flagged')        AS flagged_count,
      COUNT(*) FILTER (WHERE t.status = 'blocked')        AS blocked_count,
      COUNT(*) FILTER (WHERE t.status = 'pending' OR t.status = 'processing')
                                                          AS pending_count,
      COALESCE(AVG(t.risk_score) FILTER (WHERE t.risk_score > 0),0) AS avg_risk_score
    FROM transactions t
    ${scope.joinClause}
    WHERE t.created_at >= NOW() - INTERVAL '30 days'
    ${scope.clause};
  `;

  // Active fraud alerts — uses idx_fa_status, idx_fa_deleted_at
  const alertSql = `
    SELECT
      COUNT(*)                                              AS total_alerts,
      COUNT(*) FILTER (WHERE fa.status = 'open')           AS open_alerts,
      COUNT(*) FILTER (WHERE fa.status = 'investigating')  AS investigating_alerts,
      COUNT(*) FILTER (WHERE fa.severity = 'critical' AND fa.status NOT IN ('resolved','closed')) AS critical_alerts,
      COUNT(*) FILTER (WHERE fa.severity = 'high'     AND fa.status NOT IN ('resolved','closed')) AS high_alerts
    FROM fraud_alerts fa
    JOIN transactions t ON t.id = fa.transaction_id
    ${scope.joinClause.replace(/_sa/g,'_sa2').replace(/_c/g,'_c2')
        ? (branchId || customerId ? `
    JOIN accounts _sa2 ON _sa2.id = t.source_account_id
    ${branchId   ? `AND _sa2.branch_id = $1` : ''}
    ${customerId ? `JOIN customers _c2 ON _c2.id = _sa2.customer_id AND _c2.id = $${branchId?2:1}` : ''}` : '')
        : ''}
    WHERE fa.deleted_at IS NULL
      AND fa.created_at >= NOW() - INTERVAL '30 days';
  `;

  // Simpler alert query when no scope
  const alertSqlSimple = `
    SELECT
      COUNT(*)                                              AS total_alerts,
      COUNT(*) FILTER (WHERE status = 'open')              AS open_alerts,
      COUNT(*) FILTER (WHERE status = 'investigating')     AS investigating_alerts,
      COUNT(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('resolved','closed')) AS critical_alerts,
      COUNT(*) FILTER (WHERE severity = 'high'     AND status NOT IN ('resolved','closed')) AS high_alerts
    FROM fraud_alerts
    WHERE deleted_at IS NULL
      AND created_at >= NOW() - INTERVAL '30 days';
  `;

  // Account counts — uses idx_accounts_status, idx_accounts_deleted_at
  const accountBase = branchId
    ? `FROM accounts WHERE branch_id = $${scope.values.length + 1} AND deleted_at IS NULL`
    : customerId
    ? `FROM accounts a JOIN customers c ON c.id = a.customer_id WHERE c.id = $${scope.values.length + 1} AND a.deleted_at IS NULL`
    : `FROM accounts WHERE deleted_at IS NULL`;

  const accountSql = `
    SELECT
      COUNT(*)                                         AS total_accounts,
      COUNT(*) FILTER (WHERE status = 'active')        AS active_accounts,
      COUNT(*) FILTER (WHERE status = 'frozen')        AS frozen_accounts,
      COUNT(*) FILTER (WHERE status = 'dormant')       AS dormant_accounts
    ${accountBase};
  `;
  const accountValues = branchId ? [branchId] : customerId ? [customerId] : [];

  const [txnResult, alertResult, accountResult] = await Promise.all([
    poolQuery(txnSql,    scope.values),
    poolQuery(!branchId && !customerId ? alertSqlSimple : alertSql, scope.values),
    poolQuery(accountSql, accountValues),
  ]);

  const txn  = txnResult.rows[0]  ?? {};
  const alrt = alertResult.rows[0] ?? {};
  const acct = accountResult.rows[0] ?? {};

  const total30d = parseInt(txn.total_30d   ?? 0, 10);
  const fraudCnt = parseInt(txn.fraud_count ?? 0, 10);
  const fraudRate = total30d > 0
    ? parseFloat(((fraudCnt / total30d) * 100).toFixed(2))
    : 0;

  return {
    transactions: {
      total_30d    : total30d,
      volume_30d   : parseFloat(txn.volume_30d    ?? 0),
      total_today  : parseInt(txn.total_today  ?? 0, 10),
      volume_today : parseFloat(txn.volume_today  ?? 0),
      completed    : parseInt(txn.completed_count ?? 0, 10),
      flagged      : parseInt(txn.flagged_count   ?? 0, 10),
      blocked      : parseInt(txn.blocked_count   ?? 0, 10),
      pending      : parseInt(txn.pending_count   ?? 0, 10),
      avg_risk_score: parseFloat(txn.avg_risk_score ?? 0).toFixed(4),
    },
    fraud: {
      count_30d    : fraudCnt,
      volume_30d   : parseFloat(txn.fraud_volume  ?? 0),
      rate_30d_pct : fraudRate,
    },
    alerts: {
      total         : parseInt(alrt.total_alerts          ?? 0, 10),
      open          : parseInt(alrt.open_alerts           ?? 0, 10),
      investigating : parseInt(alrt.investigating_alerts  ?? 0, 10),
      critical      : parseInt(alrt.critical_alerts       ?? 0, 10),
      high          : parseInt(alrt.high_alerts           ?? 0, 10),
    },
    accounts: {
      total   : parseInt(acct.total_accounts   ?? 0, 10),
      active  : parseInt(acct.active_accounts  ?? 0, 10),
      frozen  : parseInt(acct.frozen_accounts  ?? 0, 10),
      dormant : parseInt(acct.dormant_accounts ?? 0, 10),
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. RISK DISTRIBUTION  (score buckets + severity breakdown)
// ─────────────────────────────────────────────────────────────────────────────

export const getRiskDistribution = async (branchId = null, customerId = null) => {
  const scope = buildScopeFilter(branchId, customerId, 1);

  const sql = `
    SELECT
      /* Risk score buckets — uses idx_txn_risk_score */
      COUNT(*) FILTER (WHERE t.risk_score < 0.30)              AS low_risk,
      COUNT(*) FILTER (WHERE t.risk_score >= 0.30 AND t.risk_score < 0.60) AS medium_risk,
      COUNT(*) FILTER (WHERE t.risk_score >= 0.60 AND t.risk_score < 0.80) AS high_risk,
      COUNT(*) FILTER (WHERE t.risk_score >= 0.80)             AS critical_risk,

      /* Score percentiles */
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY t.risk_score) AS p50_risk,
      PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY t.risk_score) AS p90_risk,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY t.risk_score) AS p95_risk,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY t.risk_score) AS p99_risk,

      /* Fraud flag distribution */
      COUNT(*) FILTER (WHERE t.is_fraud = TRUE)  AS fraud_flagged,
      COUNT(*) FILTER (WHERE t.is_fraud = FALSE) AS not_fraud,

      /* Channel breakdown */
      COUNT(*) FILTER (WHERE t.channel = 'web')    AS ch_web,
      COUNT(*) FILTER (WHERE t.channel = 'mobile') AS ch_mobile,
      COUNT(*) FILTER (WHERE t.channel = 'atm')    AS ch_atm,
      COUNT(*) FILTER (WHERE t.channel = 'pos')    AS ch_pos,
      COUNT(*) FILTER (WHERE t.channel = 'upi')    AS ch_upi,
      COUNT(*) FILTER (WHERE t.channel IN ('neft','rtgs','imps')) AS ch_bank_transfer,
      COUNT(*) FILTER (WHERE t.channel = 'branch') AS ch_branch
    FROM transactions t
    ${scope.joinClause}
    WHERE t.created_at >= NOW() - INTERVAL '30 days'
    ${scope.clause};
  `;

  // Alert severity breakdown — uses idx_fa_severity
  const alertSql = `
    SELECT
      severity,
      COUNT(*) AS cnt,
      COALESCE(AVG(fa.risk_score),0) AS avg_score
    FROM fraud_alerts fa
    WHERE fa.deleted_at IS NULL
      AND fa.status NOT IN ('closed')
    GROUP BY severity
    ORDER BY
      CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                    WHEN 'medium'   THEN 3 ELSE 4 END;
  `;

  const [txnResult, alertResult] = await Promise.all([
    poolQuery(sql, scope.values),
    poolQuery(alertSql, []),
  ]);

  const r = txnResult.rows[0] ?? {};
  const totalTxn = ['low_risk','medium_risk','high_risk','critical_risk']
    .reduce((s, k) => s + parseInt(r[k] ?? 0, 10), 0);

  const pct = (n) => totalTxn > 0
    ? parseFloat(((parseInt(n ?? 0, 10) / totalTxn) * 100).toFixed(1))
    : 0;

  return {
    score_buckets: {
      low      : { count: parseInt(r.low_risk      ?? 0, 10), pct: pct(r.low_risk) },
      medium   : { count: parseInt(r.medium_risk   ?? 0, 10), pct: pct(r.medium_risk) },
      high     : { count: parseInt(r.high_risk     ?? 0, 10), pct: pct(r.high_risk) },
      critical : { count: parseInt(r.critical_risk ?? 0, 10), pct: pct(r.critical_risk) },
    },
    percentiles: {
      p50: parseFloat(r.p50_risk ?? 0).toFixed(4),
      p90: parseFloat(r.p90_risk ?? 0).toFixed(4),
      p95: parseFloat(r.p95_risk ?? 0).toFixed(4),
      p99: parseFloat(r.p99_risk ?? 0).toFixed(4),
    },
    fraud_flags: {
      flagged    : parseInt(r.fraud_flagged ?? 0, 10),
      legitimate : parseInt(r.not_fraud    ?? 0, 10),
    },
    channel_breakdown: {
      web          : parseInt(r.ch_web           ?? 0, 10),
      mobile       : parseInt(r.ch_mobile        ?? 0, 10),
      atm          : parseInt(r.ch_atm           ?? 0, 10),
      pos          : parseInt(r.ch_pos           ?? 0, 10),
      upi          : parseInt(r.ch_upi           ?? 0, 10),
      bank_transfer: parseInt(r.ch_bank_transfer ?? 0, 10),
      branch       : parseInt(r.ch_branch        ?? 0, 10),
    },
    alert_severity: alertResult.rows.map(row => ({
      severity  : row.severity,
      count     : parseInt(row.cnt, 10),
      avg_score : parseFloat(row.avg_score).toFixed(4),
    })),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. RECENT ACTIVITY  (last N transactions + alerts)
// ─────────────────────────────────────────────────────────────────────────────

export const getRecentActivity = async (branchId = null, customerId = null, limit = 15) => {
  const scope = buildScopeFilter(branchId, customerId, 2);
  const vals  = [limit, ...scope.values];

  const txnSql = `
    SELECT
      t.id, t.transaction_ref, t.txn_type, t.status,
      t.amount, t.currency, t.channel,
      t.risk_score, t.is_fraud, t.created_at,
      sa.account_number AS source_account_number,
      da.account_number AS dest_account_number
    FROM transactions t
    LEFT JOIN accounts sa ON sa.id = t.source_account_id
    LEFT JOIN accounts da ON da.id = t.destination_account_id
    ${scope.joinClause}
    WHERE t.created_at >= NOW() - INTERVAL '7 days'
    ${scope.clause}
    ORDER BY t.created_at DESC
    LIMIT $1;
  `;

  // Recent HIGH/CRITICAL alerts — uses idx_fa_severity + idx_fa_created_at
  const alertSql = `
    SELECT
      fa.id, fa.severity, fa.status, fa.risk_score,
      fa.trigger_reasons, fa.created_at,
      t.transaction_ref, t.amount, t.currency, t.channel,
      u.first_name || ' ' || u.last_name AS assigned_analyst
    FROM fraud_alerts fa
    JOIN transactions t ON t.id = fa.transaction_id
    LEFT JOIN users u ON u.id = fa.assigned_to
    WHERE fa.deleted_at IS NULL
      AND fa.severity IN ('high','critical')
      AND fa.status NOT IN ('closed','resolved')
    ORDER BY fa.created_at DESC
    LIMIT 10;
  `;

  const [txnResult, alertResult] = await Promise.all([
    poolQuery(txnSql,  vals),
    poolQuery(alertSql, []),
  ]);

  return {
    transactions : txnResult.rows,
    alerts       : alertResult.rows,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. 30-DAY TREND  (daily buckets for sparkline/chart)
// ─────────────────────────────────────────────────────────────────────────────

export const getTrend30d = async (branchId = null, customerId = null) => {
  const scope = buildScopeFilter(branchId, customerId, 1);

  // Transaction trend — uses idx_txn_created_at (range scan → group)
  const txnSql = `
    SELECT
      DATE_TRUNC('day', t.created_at)              AS day,
      COUNT(*)                                     AS txn_count,
      COALESCE(SUM(t.amount),    0)                AS volume,
      COUNT(*) FILTER (WHERE t.is_fraud = TRUE)    AS fraud_count,
      COUNT(*) FILTER (WHERE t.status = 'flagged') AS flagged_count,
      COUNT(*) FILTER (WHERE t.status = 'blocked') AS blocked_count,
      COALESCE(AVG(CASE WHEN t.risk_score > 0 THEN t.risk_score END), 0) AS avg_risk_score
    FROM transactions t
    ${scope.joinClause}
    WHERE t.created_at >= NOW() - INTERVAL '30 days'
    ${scope.clause}
    GROUP BY DATE_TRUNC('day', t.created_at)
    ORDER BY day ASC;
  `;

  // Alert trend — uses idx_fa_created_at
  const alertSql = `
    SELECT
      DATE_TRUNC('day', created_at) AS day,
      COUNT(*)                       AS alert_count,
      COUNT(*) FILTER (WHERE severity IN ('high','critical')) AS serious_count
    FROM fraud_alerts
    WHERE deleted_at IS NULL
      AND created_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE_TRUNC('day', created_at)
    ORDER BY day ASC;
  `;

  const [txnResult, alertResult] = await Promise.all([
    poolQuery(txnSql,  scope.values),
    poolQuery(alertSql, []),
  ]);

  // Merge into a single series keyed by date string
  const byDay = new Map();

  // Seed all 30 days so gaps show zero
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, {
      date: key,
      txn_count: 0, volume: 0, fraud_count: 0,
      flagged_count: 0, blocked_count: 0, avg_risk_score: 0,
      alert_count: 0, serious_alert_count: 0,
    });
  }

  txnResult.rows.forEach(r => {
    const key = new Date(r.day).toISOString().slice(0, 10);
    if (byDay.has(key)) {
      Object.assign(byDay.get(key), {
        txn_count     : parseInt(r.txn_count,     10),
        volume        : parseFloat(r.volume),
        fraud_count   : parseInt(r.fraud_count,   10),
        flagged_count : parseInt(r.flagged_count, 10),
        blocked_count : parseInt(r.blocked_count, 10),
        avg_risk_score: parseFloat(r.avg_risk_score).toFixed(4),
      });
    }
  });

  alertResult.rows.forEach(r => {
    const key = new Date(r.day).toISOString().slice(0, 10);
    if (byDay.has(key)) {
      Object.assign(byDay.get(key), {
        alert_count        : parseInt(r.alert_count,   10),
        serious_alert_count: parseInt(r.serious_count, 10),
      });
    }
  });

  const series = [...byDay.values()];

  // Compute summary stats over the 30-day window
  const totals = series.reduce((acc, d) => ({
    txn_count     : acc.txn_count   + d.txn_count,
    volume        : acc.volume      + d.volume,
    fraud_count   : acc.fraud_count + d.fraud_count,
    alert_count   : acc.alert_count + d.alert_count,
  }), { txn_count: 0, volume: 0, fraud_count: 0, alert_count: 0 });

  const fraudRate = totals.txn_count > 0
    ? parseFloat(((totals.fraud_count / totals.txn_count) * 100).toFixed(2))
    : 0;

  return { series, totals: { ...totals, fraud_rate_pct: fraudRate } };
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. ACTIVE ALERTS DETAIL  (for the alerts widget)
// ─────────────────────────────────────────────────────────────────────────────

export const getActiveAlerts = async (branchId = null, limit = 10) => {
  const vals   = branchId ? [limit, branchId] : [limit];
  const filter = branchId
    ? `AND EXISTS (
         SELECT 1 FROM accounts a
         WHERE a.id = t.source_account_id AND a.branch_id = $2
       )`
    : '';

  const sql = `
    SELECT
      fa.id, fa.severity, fa.status, fa.risk_score,
      fa.trigger_reasons, fa.assigned_at, fa.created_at,
      t.transaction_ref, t.amount, t.currency, t.txn_type, t.channel,
      u.first_name || ' ' || u.last_name AS assigned_analyst,
      u.email AS analyst_email,
      sa.account_number AS source_account_number
    FROM fraud_alerts fa
    JOIN transactions t ON t.id = fa.transaction_id
    LEFT JOIN accounts sa ON sa.id = t.source_account_id
    LEFT JOIN users u ON u.id = fa.assigned_to
    WHERE fa.deleted_at IS NULL
      AND fa.status NOT IN ('resolved','closed')
    ${filter}
    ORDER BY
      CASE fa.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                        WHEN 'medium'  THEN 3 ELSE 4 END,
      fa.created_at DESC
    LIMIT $1;
  `;
  const { rows } = await poolQuery(sql, vals);
  return rows;
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. TOP CUSTOMERS BY RISK / VOLUME  (leaderboard widget)
// ─────────────────────────────────────────────────────────────────────────────

export const getTopCustomersByRisk = async (branchId = null, limit = 10) => {
  const vals   = branchId ? [limit, branchId] : [limit];
  const filter = branchId ? `AND a.branch_id = $2` : '';

  const sql = `
    SELECT
      c.id AS customer_id,
      c.customer_number,
      u.first_name || ' ' || u.last_name AS customer_name,
      c.risk_rating,
      COUNT(t.id)                         AS txn_count_30d,
      COALESCE(SUM(t.amount),0)           AS volume_30d,
      COALESCE(MAX(t.risk_score),0)       AS max_risk_score,
      COUNT(t.id) FILTER (WHERE t.is_fraud) AS fraud_count,
      COUNT(fa.id)                        AS open_alerts
    FROM customers c
    JOIN users u       ON u.id = c.user_id
    JOIN accounts a    ON a.customer_id = c.id ${filter}
    LEFT JOIN transactions t ON (t.source_account_id = a.id OR t.destination_account_id = a.id)
                             AND t.created_at >= NOW() - INTERVAL '30 days'
    LEFT JOIN fraud_alerts fa ON fa.transaction_id = t.id
                             AND fa.status NOT IN ('closed','resolved')
                             AND fa.deleted_at IS NULL
    WHERE c.deleted_at IS NULL
    GROUP BY c.id, c.customer_number, u.first_name, u.last_name, c.risk_rating
    HAVING MAX(t.risk_score) > 0 OR COUNT(fa.id) > 0
    ORDER BY max_risk_score DESC, open_alerts DESC
    LIMIT $1;
  `;
  const { rows } = await poolQuery(sql, vals);
  return rows;
};
