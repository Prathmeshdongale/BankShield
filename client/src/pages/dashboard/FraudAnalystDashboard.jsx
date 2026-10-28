/**
 * FraudAnalystDashboard.jsx — Fraud investigation dashboard.
 * All data from live API — no hardcoded values.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ShieldCheck, Activity, RefreshCw, Search } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge }   from '@/components/ui/StatusBadge';
import { RiskBadge }     from '@/components/fraud/RiskBadge';
import { InlineLoader }  from '@/components/ui/LoadingOverlay';
import { ErrorMessage }  from '@/components/ui/ErrorMessage';
import { Button }        from '@/components/ui/button';
import Select            from '@/components/ui/Select';
import { fraudService }     from '@/services/fraudService';
import { dashboardService } from '@/services/dashboardService';
import api                  from '@/services/api';

const fmtAmt = (n) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(n ?? 0);

const fmtDate = (s) => s
  ? new Date(s).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
  : '—';

const STATUSES = ['', 'open', 'investigating', 'escalated'];

const FraudAnalystDashboard = () => {
  const [alerts,   setAlerts]   = useState([]);
  const [summary,  setSummary]  = useState(null);
  const [mlHealth, setMlHealth] = useState(null);
  const [status,   setStatus]   = useState('');
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [alertRes, sumRes] = await Promise.allSettled([
        fraudService.listAlerts({ status: status || undefined, limit: 12, sortDir: 'DESC' }),
        dashboardService.getSummary(),
      ]);
      if (alertRes.status === 'fulfilled') setAlerts(alertRes.value.data?.data ?? []);
      if (sumRes.status   === 'fulfilled') setSummary(sumRes.value.data);

      // ML health check (best-effort, non-blocking)
      try {
        const health = await api.get('/fraud/ml-status');
        setMlHealth(health.data?.data ?? null);
      } catch {}
    } catch (e) {
      setError('Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const stats = {
    open        : alerts.filter(a => a.status === 'open').length,
    investigating: alerts.filter(a => a.status === 'investigating').length,
    escalated   : alerts.filter(a => a.status === 'escalated').length,
    critical    : alerts.filter(a => a.severity === 'critical').length,
  };

  if (loading) return <InlineLoader label="Loading fraud dashboard…" />;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Fraud Investigation Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            ML-powered fraud detection with SHAP explanations
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={status} onChange={e => setStatus(e.target.value)} className="w-40">
            {STATUSES.map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </Select>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      <ErrorMessage message={error} />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Fraud Rate (30d)',  value: `${(summary?.fraud?.rate_30d_pct ?? 0).toFixed(2)}%`, cls: 'text-red-600 dark:text-red-400'    },
          { label: 'Open',             value: stats.open,                                             cls: 'text-amber-600 dark:text-amber-400' },
          { label: 'Investigating',    value: stats.investigating,                                    cls: 'text-blue-600 dark:text-blue-400'   },
          { label: 'Escalated',        value: stats.escalated,                                        cls: 'text-orange-600 dark:text-orange-400'},
          { label: 'Critical',         value: stats.critical,                                         cls: 'text-red-600 dark:text-red-400'     },
        ].map(({ label, value, cls }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
              <div className={`text-2xl font-bold mt-1 ${cls}`}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alert queue */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Alert Queue
          </CardTitle>
          <Link to="/fraud/alerts" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
            Full queue →
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-slate-400">
              <ShieldCheck className="h-8 w-8" />
              <p className="text-sm">No alerts match your filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 text-left">
                    {['Transaction', 'Amount', 'Risk Score', 'Severity', 'Status', 'Analyst', 'Created', ''].map(h => (
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
                      <td className="px-4 py-2.5 text-slate-400">{a.analyst_email ?? '—'}</td>
                      <td className="px-4 py-2.5 text-slate-400">{fmtDate(a.created_at)}</td>
                      <td className="px-4 py-2.5">
                        <Link to="/fraud/alerts">
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]">Review</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ML model status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-purple-500" /> ML Model Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mlHealth ? (
            <div className="grid gap-4 sm:grid-cols-4">
              {[
                { label: 'Status',          value: mlHealth.status ?? '—'          },
                { label: 'Model',           value: mlHealth.model_version ?? '—'   },
                { label: 'Features',        value: mlHealth.model_features ?? '—'  },
                { label: 'Threshold',       value: mlHealth.threshold ?? '—'       },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
                  <div className="mt-1 font-mono text-sm font-medium text-slate-900 dark:text-slate-100">{String(value)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">ML service health unavailable — check if FastAPI is running on port 8000.</p>
          )}
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Full Alert Queue',   path: '/fraud/alerts',         Icon: AlertTriangle, bg: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'       },
          { label: 'Investigations',     path: '/fraud/investigations', Icon: Search,        bg: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'   },
          { label: 'Fraud Reports',      path: '/reports',              Icon: Activity,      bg: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
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

export default FraudAnalystDashboard;
