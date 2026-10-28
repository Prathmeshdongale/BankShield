/**
 * SuperAdminDashboard.jsx — Platform administration dashboard.
 * All data from live API — no hardcoded values.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Users, Settings, Activity, ShieldCheck, Lock, RefreshCw, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { InlineLoader }  from '@/components/ui/LoadingOverlay';
import { ErrorMessage }  from '@/components/ui/ErrorMessage';
import { Button }        from '@/components/ui/button';
import { dashboardService } from '@/services/dashboardService';
import api from '@/services/api';

const fmtDate = (s) => s
  ? new Date(s).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
  : '—';

const SuperAdminDashboard = () => {
  const [summary,   setSummary]   = useState(null);
  const [mlHealth,  setMlHealth]  = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [sumRes] = await Promise.allSettled([
        dashboardService.getSummary(),
      ]);
      if (sumRes.status === 'fulfilled') setSummary(sumRes.value.data);

      // ML health (best-effort)
      try {
        const r = await api.get('/fraud/ml-status');
        setMlHealth(r.data?.data ?? null);
      } catch {}
    } catch (e) {
      setError('Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <InlineLoader label="Loading admin dashboard…" />;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Platform Administration
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            System configuration, user management, and infrastructure monitoring.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <ErrorMessage message={error} />

      {/* Platform KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Active Accounts',  value: (summary?.accounts?.active ?? '—').toLocaleString(),           sub: 'platform-wide',                        Icon: ShieldCheck, cls: 'text-blue-500'    },
          { label: '30-Day Txn Volume',value: summary?.transactions?.volume_30d != null ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(summary.transactions.volume_30d) : '—', sub: `${summary?.transactions?.total_30d ?? 0} transactions`, Icon: Activity, cls: 'text-emerald-500' },
          { label: 'Fraud Rate',       value: `${(summary?.fraud?.rate_30d_pct ?? 0).toFixed(2)}%`,          sub: 'last 30 days',                           Icon: AlertTriangle,cls: (summary?.fraud?.rate_30d_pct ?? 0) > 5 ? 'text-red-500' : 'text-amber-500' },
          { label: 'Open Alerts',      value: summary?.alerts?.open ?? '—',                                  sub: `${summary?.alerts?.critical ?? 0} critical`, Icon: AlertTriangle,cls: (summary?.alerts?.open ?? 0) > 0 ? 'text-red-500' : 'text-green-500' },
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

      {/* Service health */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-purple-500" /> ML Service Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mlHealth ? (
              <div className="space-y-2">
                {[
                  ['Status',          mlHealth.status],
                  ['Model',           mlHealth.model_version],
                  ['Features',        mlHealth.model_features],
                  ['Threshold',       mlHealth.threshold],
                  ['Uptime',          mlHealth.uptime_seconds ? `${Math.floor(mlHealth.uptime_seconds / 60)} min` : '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-900/50 px-3 py-2 text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{label}</span>
                    <span className={`font-mono font-medium ${
                      label === 'Status' && value === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'
                    }`}>{String(value ?? '—')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">ML service unreachable — start FastAPI on port 8000.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-500" /> System Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              ['Environment',    import.meta.env.MODE],
              ['API Base URL',   '/api'],
              ['ML Service URL', 'http://localhost:8000'],
              ['Fraud Flag Threshold', `${(parseFloat(import.meta.env.VITE_FRAUD_FLAG_THRESHOLD ?? '0.30') * 100).toFixed(0)}% risk score`],
              ['Fraud Block Threshold',`${(parseFloat(import.meta.env.VITE_FRAUD_BLOCK_THRESHOLD ?? '0.80') * 100).toFixed(0)}% risk score`],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-900/50 px-3 py-2 text-sm">
                <span className="text-slate-500 dark:text-slate-400">{label}</span>
                <span className="font-mono font-medium text-slate-900 dark:text-slate-100 text-xs">{String(value ?? '—')}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'User Management',  path: '/admin/users',      Icon: Users,    bg: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'     },
          { label: 'System Settings',  path: '/admin/settings',   Icon: Settings, bg: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
          { label: 'Audit Logs',       path: '/admin/audit-logs', Icon: Activity, bg: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'  },
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

export default SuperAdminDashboard;
