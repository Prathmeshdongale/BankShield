/**
 * fraudQueries.js — Raw SQL for fraud_predictions, fraud_alerts, notifications.
 *
 * fraud_predictions columns:
 *   id BIGSERIAL PK, transaction_id UUID FK→transactions RESTRICT,
 *   model_version VARCHAR(50), risk_score NUMERIC(6,4),
 *   is_fraud BOOLEAN, confidence NUMERIC(6,4),
 *   feature_vector JSONB, explanation JSONB, inference_ms INT,
 *   created_at TIMESTAMPTZ
 *
 * fraud_alerts columns:
 *   id UUID PK, transaction_id UUID FK RESTRICT, prediction_id BIGINT FK SET NULL,
 *   risk_score NUMERIC(6,4), severity alert_severity, status alert_status DEFAULT 'open',
 *   trigger_reasons JSONB, assigned_to UUID FK SET NULL, assigned_at TIMESTAMPTZ,
 *   first_reviewed_at, resolved_at, auto_resolved BOOLEAN,
 *   deleted_at, created_at, updated_at
 *
 * notifications columns:
 *   id BIGSERIAL PK, user_id UUID FK CASCADE,
 *   title VARCHAR(200), body TEXT,
 *   channel notification_channel DEFAULT 'in_app',
 *   status notification_status DEFAULT 'pending',
 *   related_entity VARCHAR(50), related_id UUID,
 *   sent_at, read_at, metadata JSONB,
 *   created_at, updated_at
 */

import { query as poolQuery } from '../connection.js';

const run = (client, text, params) =>
  client ? client.query(text, params) : poolQuery(text, params);

// ─────────────────────────────────────────────────────────────────────────────
// VELOCITY FEATURE QUERIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count transactions from this account in the last N minutes.
 * Used to compute velocity_1h (60 min) and velocity_24h (1440 min).
 */
export const countRecentTransactions = async (accountId, minutes, client = null) => {
  const { rows } = await run(client, `
    SELECT COUNT(*) AS cnt
    FROM   transactions
    WHERE  (source_account_id = $1 OR destination_account_id = $1)
      AND  status NOT IN ('failed','reversed')
      AND  created_at >= NOW() - ($2 || ' minutes')::INTERVAL;
  `, [accountId, minutes]);
  return parseInt(rows[0].cnt, 10);
};

/** Sum of amounts spent from this account in the last N minutes. */
export const sumRecentSpend = async (accountId, minutes, client = null) => {
  const { rows } = await run(client, `
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM   transactions
    WHERE  source_account_id = $1
      AND  status NOT IN ('failed','reversed','blocked')
      AND  created_at >= NOW() - ($2 || ' minutes')::INTERVAL;
  `, [accountId, minutes]);
  return parseFloat(rows[0].total);
};

/** Count distinct merchant categories used in the last 24 hours. */
export const countDistinctMerchants24h = async (accountId, client = null) => {
  const { rows } = await run(client, `
    SELECT COUNT(DISTINCT merchant_category) AS cnt
    FROM   transactions
    WHERE  source_account_id = $1
      AND  merchant_category IS NOT NULL
      AND  status NOT IN ('failed','reversed','blocked')
      AND  created_at >= NOW() - INTERVAL '24 hours';
  `, [accountId]);
  return parseInt(rows[0].cnt, 10);
};

/**
 * Compute account-level statistics (mean + std of historical amounts).
 * Used for amount_zscore feature.
 */
export const getAccountTxnStats = async (accountId, client = null) => {
  const { rows } = await run(client, `
    SELECT
      COALESCE(AVG(amount), 0)    AS mean_amount,
      COALESCE(STDDEV(amount), 0) AS std_amount,
      COUNT(*)                    AS txn_count
    FROM   transactions
    WHERE  source_account_id = $1
      AND  status NOT IN ('failed','reversed','blocked')
      AND  created_at >= NOW() - INTERVAL '90 days';
  `, [accountId]);
  return {
    meanAmount : parseFloat(rows[0].mean_amount),
    stdAmount  : parseFloat(rows[0].std_amount),
    txnCount   : parseInt(rows[0].txn_count, 10),
  };
};

/**
 * Get the most recent device fingerprint and country used by this account.
 * Used to detect is_new_device and country_mismatch.
 */
export const getLastSeenDeviceAndCountry = async (accountId, client = null) => {
  const { rows } = await run(client, `
    SELECT device_fingerprint, location_country, location_city
    FROM   transactions
    WHERE  source_account_id = $1
      AND  status NOT IN ('failed','reversed','blocked')
      AND  device_fingerprint IS NOT NULL
    ORDER  BY created_at DESC
    LIMIT  1;
  `, [accountId]);
  return rows[0] ?? null;
};

/** Get all distinct device fingerprints seen on this account in last 30 days. */
export const getKnownDevices = async (accountId, client = null) => {
  const { rows } = await run(client, `
    SELECT DISTINCT device_fingerprint
    FROM   transactions
    WHERE  source_account_id = $1
      AND  device_fingerprint IS NOT NULL
      AND  created_at >= NOW() - INTERVAL '30 days';
  `, [accountId]);
  return new Set(rows.map(r => r.device_fingerprint));
};

// ─────────────────────────────────────────────────────────────────────────────
// FRAUD_PREDICTIONS
// ─────────────────────────────────────────────────────────────────────────────

export const insertFraudPrediction = async ({
  transactionId, modelVersion, riskScore, isFraud,
  confidence = null, featureVector = null, explanation = null, inferenceMs = null,
}, client = null) => {
  const { rows } = await run(client, `
    INSERT INTO fraud_predictions
      (transaction_id, model_version, risk_score, is_fraud,
       confidence, feature_vector, explanation, inference_ms)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id, transaction_id, model_version, risk_score, is_fraud,
              confidence, inference_ms, created_at;
  `, [
    transactionId, modelVersion, riskScore, isFraud,
    confidence,
    featureVector ? JSON.stringify(featureVector) : null,
    explanation   ? JSON.stringify(explanation)   : null,
    inferenceMs,
  ]);
  return rows[0];
};

// ─────────────────────────────────────────────────────────────────────────────
// FRAUD_ALERTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map risk_score (0–1) to alert_severity enum.
 *   < 0.30  → low
 *   < 0.60  → medium
 *   < 0.80  → high
 *   ≥ 0.80  → critical
 */
export const riskScoreToSeverity = (riskScore) => {
  if (riskScore >= 0.80) return 'critical';
  if (riskScore >= 0.60) return 'high';
  if (riskScore >= 0.30) return 'medium';
  return 'low';
};

export const insertFraudAlert = async ({
  transactionId, predictionId = null, riskScore,
  triggerReasons = [], severity = null,
}, client = null) => {
  const resolvedSeverity = severity ?? riskScoreToSeverity(riskScore);
  const { rows } = await run(client, `
    INSERT INTO fraud_alerts
      (transaction_id, prediction_id, risk_score, severity,
       status, trigger_reasons, auto_resolved)
    VALUES ($1, $2, $3, $4::alert_severity, 'open', $5, FALSE)
    RETURNING *;
  `, [
    transactionId,
    predictionId,
    riskScore,
    resolvedSeverity,
    JSON.stringify(triggerReasons),
  ]);
  return rows[0];
};

export const findFraudAlertByTransactionId = async (transactionId, client = null) => {
  const { rows } = await run(client, `
    SELECT * FROM fraud_alerts
    WHERE  transaction_id = $1
      AND  deleted_at IS NULL
    ORDER  BY created_at DESC
    LIMIT  1;
  `, [transactionId]);
  return rows[0] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const insertNotification = async ({
  userId, title, body,
  channel = 'in_app', relatedEntity = null, relatedId = null,
  metadata = null,
}, client = null) => {
  const { rows } = await run(client, `
    INSERT INTO notifications
      (user_id, title, body, channel, status, related_entity, related_id, metadata)
    VALUES ($1, $2, $3, $4::notification_channel, 'pending', $5, $6, $7)
    RETURNING id, user_id, title, channel, status, created_at;
  `, [
    userId, title, body, channel, relatedEntity, relatedId,
    metadata ? JSON.stringify(metadata) : null,
  ]);
  return rows[0];
};

export const markNotificationSent = async (id, client = null) => {
  await run(client, `
    UPDATE notifications
    SET    status = 'sent', sent_at = NOW(), updated_at = NOW()
    WHERE  id = $1;
  `, [id]);
};

/** Fetch the user (and their email) linked to a given account. */
export const getUserByAccountId = async (accountId, client = null) => {
  const { rows } = await run(client, `
    SELECT u.id, u.email, u.first_name, u.last_name, u.phone
    FROM   users      u
    JOIN   customers  c ON c.user_id = u.id
    JOIN   accounts   a ON a.customer_id = c.id
    WHERE  a.id = $1
      AND  u.deleted_at IS NULL
    LIMIT  1;
  `, [accountId]);
  return rows[0] ?? null;
};
