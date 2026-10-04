/**
 * Dashboard.jsx — Live fraud-analytics dashboard.
 *
 * Sections:
 *   • KPI cards   — transactions, fraud rate, open alerts, active accounts
 *   • Trend chart — 30-day daily txn count + fraud count (LineChart)
 *   • Risk dist.  — score-bucket doughnut (PieChart)
 *   • Channel bkd — bar chart
 *   • Active alerts table (severity-ordered)
 *   • Top-risk customers table
 *   • Recent transaction feed
 *
 * Data: GET /api/dashboard  (one round-trip; server-side cached 60 s).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Link }         from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell, Tooltip, Legend,
  ResponsiveContainer, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  ShieldCheck, AlertTriangle, ArrowUpRight, Cpu,
  RefreshCw, TrendingUp, Users, CreditCard,
} from 'lucide-react';
import { dashboardService }    from '@/services/dashboardService';
import { RiskBadge }           from '@/components/fraud/RiskBadge';
import { StatusBadge }         from '@/components/ui/StatusBadge';
import { Button }              from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { InlineLoader }        from '@/components/ui/LoadingOverlay';
import { useAuth }             from '@/context/AuthContext';

// ── helpers ──────────────────────────────────────────────────────────────────
const fmtAmt  = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtDate = (s) => s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const fmtDay  = (s) => s ? new Date(s).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : s;

const RISK_COLORS = {
  low:      '#22c55e',
  medium:   '#eab308',
  high:     '#f97316',
  critical: '#ef4444',
};

const SEV_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e'];

// ── KPI card ─────────────────────────────────────────────────────────────────
const KpiCard = ({ title, value, sub, Icon, iconCls, valueCls }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
      <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</CardTitle>
      <Icon className={`h-4 w-4 ${iconCls ?? 'text-gray-400'}`} />
    </CardHeader>
    <CardContent>
      <div className={`text-2xl font-bold ${valueCls ?? 'text-gray-900 dark:text-white'}`}>{value}</div>
      {sub && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
    </CardContent>
  </Card>
);

// ── custom tooltip ────────────────────────────────────────────────────────────
const TrendTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg dark:border-gray-700 dark:bg-gray-900 text-xs">
      <p className="mb-1 font-semibold text-gray-700 dark:text-gray-200">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{p.value?.toLocaleString()}</strong>
        </p>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const { hasRole }  = useAuth();
  const isAnalyst    = hasRole(['super_admin','admin','compliance_officer','fraud_analyst','branch_manager']);

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await dashboardService.getFull();
      setData(res.data ?? res);
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── derived ───────────────────────────────────────────────────────────────
  const summary  = data?.summary      ?? {};
  const risk     = data?.risk         ?? {};
  const trend    = data?.trend        ?? {};
  const activity = data?.activity     ?? {};
  const alerts   = data?.active_alerts ?? data?.alerts?.alerts ?? [];
  const topCusts = data?.top_customers?.customers ?? [];

  const trendSeries = (trend.series ?? []).map(d => ({
    date:        fmtDay(d.date),
    Transactions:d.txn_count ?? 0,
    Fraud:       d.fraud_count ?? 0,
    Alerts:      d.alert_count ?? 0,
  }));

  const pieData = Object.entries(risk.score_buckets ?? {}).map(([key, val]) => ({
    name:  key.charAt(0).toUpperCase() + key.slice(1),
    value: val?.count ?? 0,
    color: RISK_COLORS[key] ?? '#94a3b8',
  }));

  const channelData = Object.entries(risk.channel_breakdown ?? {}).map(([k, v]) => ({
    channel: k.toUpperCase(),
    Transactions: v,
  }));

  // Alert severity distribution from risk endpoint
  const sevData = (risk.alert_severity ?? []).map((item, i) => ({
    name:  item.severity ?? item.name,
    value: item.count ?? item.value ?? 0,
    color: SEV_COLORS[i] ?? '#94a3b8',
  }));

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Fraud Overview Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Real-time AI telemetry, risk evaluation &amp; anomaly feed
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <InlineLoader label="Loading dashboard…" />
      ) : (
        <>
          {/* ── KPI cards ─────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="30-Day Volume"
              value={fmtAmt(summary.transactions?.volume_30d)}
              sub={`${(summary.transactions?.total_30d ?? 0).toLocaleString()} transactions`}
              Icon={ArrowUpRight}
              iconCls="text-blue-500"
            />
            <KpiCard
              title="Fraud Rate (30d)"
              value={`${(summary.fraud?.rate_30d_pct ?? 0).toFixed(2)}%`}
              sub={`${summary.fraud?.total_fraud_30d ?? 0} flagged transactions`}
              Icon={AlertTriangle}
              iconCls="text-amber-500"
              valueCls={(summary.fraud?.rate_30d_pct ?? 0) > 5 ? 'text-red-600' : 'text-amber-600'}
            />
            <KpiCard
              title="Open Alerts"
              value={summary.alerts?.open ?? 0}
              sub={`${summary.alerts?.critical ?? 0} critical`}
              Icon={ShieldCheck}
              iconCls="text-red-500"
              valueCls={summary.alerts?.open > 0 ? 'text-red-600' : 'text-green-600'}
            />
            <KpiCard
              title="Active Accounts"
              value={(summary.accounts?.active ?? 0).toLocaleString()}
              sub={`${(summary.transactions?.total_today ?? 0)} txns today`}
              Icon={CreditCard}
              iconCls="text-emerald-500"
            />
          </div>

          {/* ── 30-day trend + risk dist ───────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-3">

            {/* Trend Line */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  30-Day Transaction &amp; Fraud Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                {trendSeries.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No trend data available.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={trendSeries} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip content={<TrendTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="Transactions" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Fraud"        stroke="#ef4444" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Alerts"       stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Risk Distribution Pie */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Risk Score Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.every(d => d.value === 0) ? (
                  <p className="py-8 text-center text-sm text-gray-400">No data.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%" cy="45%"
                        innerRadius={50} outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, n) => [`${v.toLocaleString()} txns`, n]} />
                      <Legend
                        wrapperStyle={{ fontSize: 11 }}
                        formatter={(v, e) => `${v} (${e.payload.value?.toLocaleString()})`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                {/* Percentiles */}
                {risk.percentiles && (
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                    {[['P50', risk.percentiles.p50], ['P90', risk.percentiles.p90], ['P99', risk.percentiles.p99]].map(([label, val]) => (
                      <div key={label} className="text-center">
                        <p className="text-[10px] font-medium text-gray-400">{label}</p>
                        <p className="text-xs font-bold text-gray-700 dark:text-gray-300">
                          {val != null ? `${(val * 100).toFixed(1)}%` : '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Channel breakdown + Alert severity ──────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">

            {/* Channel bar chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Transactions by Channel</CardTitle>
              </CardHeader>
              <CardContent>
                {channelData.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No channel data.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={channelData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="channel" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="Transactions" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Alert severity pie */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Alert Severity Mix</CardTitle>
              </CardHeader>
              <CardContent>
                {sevData.every(d => d.value === 0) ? (
                  <p className="py-8 text-center text-sm text-gray-400">No alert data.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={sevData} cx="50%" cy="45%"
                        outerRadius={70} paddingAngle={2} dataKey="value"
                      >
                        {sevData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v, n]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Active alerts + Top customers ─────────────────────────────────── */}
          {isAnalyst && (
            <div className="grid gap-4 lg:grid-cols-2">

              {/* Active alerts */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-sm font-semibold">Active Alerts</CardTitle>
                  <Link to="/fraud/alerts">
                    <Button variant="outline" size="sm" className="h-7 text-xs">View all</Button>
                  </Link>
                </CardHeader>
                <CardContent className="p-0">
                  {alerts.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-gray-400">
                      No active alerts. Queue is clear!
                    </p>
                  ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {alerts.slice(0, 6).map(a => (
                        <div key={a.id} className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <RiskBadge score={a.risk_score} showScore={false} />
                            <div className="min-w-0">
                              <p className="truncate font-mono text-xs text-gray-700 dark:text-gray-300">
                                {a.transaction_ref ?? a.id?.slice(0, 8)}
                              </p>
                              <p className="text-[10px] text-gray-400">{fmtDate(a.created_at)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <StatusBadge value={a.severity} />
                            <StatusBadge value={a.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top-risk customers */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
                    <Users className="h-4 w-4 text-orange-500" /> Top Risk Customers
                  </CardTitle>
                  <Link to="/customers">
                    <Button variant="outline" size="sm" className="h-7 text-xs">View all</Button>
                  </Link>
                </CardHeader>
                <CardContent className="p-0">
                  {topCusts.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-gray-400">No high-risk customers.</p>
                  ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {topCusts.slice(0, 6).map(c => (
                        <div key={c.id} className="flex items-center justify-between px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                              {c.first_name} {c.last_name}
                            </p>
                            <p className="truncate text-[10px] text-gray-400">{c.email}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <RiskBadge score={c.max_risk_score ?? c.avg_risk_score ?? 0} />
                            <StatusBadge value={c.risk_rating} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Recent transaction feed ────────────────────────────────────── */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-semibold">Recent Transactions</CardTitle>
              <Link to="/transactions">
                <Button variant="outline" size="sm" className="h-7 text-xs">View all</Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {(activity.transactions ?? []).length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">No recent transactions.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/60 text-left">
                        {['Ref', 'Amount', 'Type', 'Channel', 'Status', 'Risk', 'Time'].map(h => (
                          <th key={h} className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {(activity.transactions ?? []).map(t => (
                        <tr key={t.id} className="bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/60">
                          <td className="px-4 py-2.5 font-mono text-[11px] text-gray-600 dark:text-gray-300">
                            {t.transaction_ref}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">
                            {fmtAmt(t.amount)}
                          </td>
                          <td className="px-4 py-2.5 capitalize text-gray-600 dark:text-gray-400">
                            {t.txn_type ?? t.transaction_type}
                          </td>
                          <td className="px-4 py-2.5 text-gray-500">{t.channel ?? '—'}</td>
                          <td className="px-4 py-2.5">
                            <StatusBadge value={t.status} />
                          </td>
                          <td className="px-4 py-2.5">
                            <RiskBadge score={t.risk_score} />
                          </td>
                          <td className="px-4 py-2.5 text-gray-400">{fmtDate(t.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default Dashboard;
