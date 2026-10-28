/**
 * BranchManagerDashboard.jsx — Branch operations dashboard.
 * All data from live API — no hardcoded values.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Users, Building2, AlertTriangle, TrendingUp, FileText, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge }   from '@/components/ui/StatusBadge';
import { RiskBadge }     from '@/components/fraud/RiskBadge';
import { InlineLoader }  from '@/components/ui/LoadingOverlay';
import { ErrorMessage }  from '@/components/ui/ErrorMessage';
import { Button }        from '@/components/ui/button';
import { dashboardService } from '@/services/dashboardService';
import { fraudService }     from '@/services/fraudService';

const fmtAmt = (n) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(n ?? 0);

const fmtDate = (s) => s
  ? new Date(s).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
  : '—';

const BranchManagerDashboard = () => {
  const { user }   = useAuth();
  const [data,     setData]    = useState(null);
  const [alerts,   setAlerts]  = useState([]);
  const [loading,  setLoading] = useState(true);
  const [error,    setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [dashRes, alertRes] = await Promise.allSettled([
        dashboardService.getFull(),
        fraudService.listAlerts({ limit: 5, sortDir: 'DESC' }),
      ]);
      if (dashRes.status  === 'fulfilled') setData(dashRes.value.data ?? dashRes.value);
      if (alertRes.status === 'fulfilled') setAlerts(alertRes.value.data?.data ?? []);
    } catch (e) {
      setError('Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <InlineLoader label="Loading branch dashboard…" />;

  const summary = data?.summary ?? {};
  const topCusts = data?.top_customers?.customers ?? [];
  const recentTxns = data?.activity?.transactions ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Branch Operations
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manager: {user?.firstName} {user?.lastName}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <ErrorMessage message={error} />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Active Accounts',    value: (summary.accounts?.active ?? '—').toLocaleString(),         sub: 'in branch',                                                Icon: Building2,    cls: 'text-blue-500'    },
          { label: '30-Day Volume',      value: fmtAmt(summary.transactions?.volume_30d),                   sub: `${summary.transactions?.total_30d ?? 0} transactions`,    Icon: TrendingUp,   cls: 'text-emerald-500' },
          { label: 'Fraud Rate',         value: `${(summary.fraud?.rate_30d_pct ?? 0).toFixed(2)}%`,        sub: 'last 30 days',                                              Icon: AlertTriangle,cls: (summary.fraud?.rate_30d_pct ?? 0) > 5 ? 'text-red-500' : 'text-amber-500' },
          { label: 'Open Alerts',        value: summary.alerts?.open ?? '—',                                sub: `${summary.alerts?.critical ?? 0} critical`,               Icon: AlertTriangle,cls: (summary.alerts?.open ?? 0) > 0 ? 'text-red-500' : 'text-green-500' },
        ].map(({ label, value, sub, Icon, cls }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</CardTitle>
              <Icon className={`h-4 w-4 ${cls}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Fraud alerts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Recent Fraud Alerts</CardTitle>
          <Link to="/fraud/alerts" className="text-xs text-blue-600 hover:underline dark:text-blue-400">View all alerts</Link>
        </CardHeader>
        <CardContent className="p-0">
          {alerts.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">No active alerts. Queue is clear!</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 text-left">
                    {['Transaction', 'Amount', 'Risk', 'Severity', 'Status', 'Created'].map(h => (
                      <th key={h} className="px-4 py-2.5 font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {alerts.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">{a.transaction_ref ?? a.id?.slice(0,8)}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">{fmtAmt(a.amount)}</td>
                      <td className="px-4 py-2.5"><RiskBadge score={a.risk_score} /></td>
                      <td className="px-4 py-2.5"><StatusBadge value={a.severity} /></td>
                      <td className="px-4 py-2.5"><StatusBadge value={a.status} /></td>
                      <td className="px-4 py-2.5 text-slate-400">{fmtDate(a.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent transactions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Recent Transactions</CardTitle>
          <Link to="/transactions" className="text-xs text-blue-600 hover:underline dark:text-blue-400">View all</Link>
        </CardHeader>
        <CardContent className="p-0">
          {recentTxns.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">No recent transactions.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 text-left">
                    {['Ref', 'Amount', 'Type', 'Channel', 'Status', 'Risk'].map(h => (
                      <th key={h} className="px-4 py-2.5 font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentTxns.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">{t.transaction_ref}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">{fmtAmt(t.amount)}</td>
                      <td className="px-4 py-2.5 capitalize text-slate-600 dark:text-slate-400">{t.txn_type}</td>
                      <td className="px-4 py-2.5 text-slate-500">{t.channel ?? '—'}</td>
                      <td className="px-4 py-2.5"><StatusBadge value={t.status} /></td>
                      <td className="px-4 py-2.5"><RiskBadge score={t.risk_score} showScore={false} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Customers',     path: '/branch/customers', Icon: Users,        bg: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'     },
          { label: 'Accounts',      path: '/branch/accounts',  Icon: Building2,    bg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' },
          { label: 'Alert Review',  path: '/fraud/alerts',     Icon: AlertTriangle,bg: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'   },
          { label: 'Branch Reports',path: '/reports',          Icon: FileText,     bg: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
        ].map(({ label, path, Icon, bg }) => (
          <Link key={path} to={path}>
            <Card className="cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
              <CardContent className="p-6 flex flex-col items-center text-center">
                <div className={`mb-3 rounded-full p-3 ${bg}`}><Icon className="h-6 w-6" /></div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</h3>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default BranchManagerDashboard;
