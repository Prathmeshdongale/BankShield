/**
 * CustomerHome.jsx — /portal
 *
 * Customer-facing overview dashboard. Shows:
 *   • Greeting + role badge
 *   • Account summary cards (balance, status) — up to 4
 *   • Quick-action buttons (Transfer, Pay, Statement)
 *   • Recent 5 transactions
 *   • Open fraud alert count banner (if any)
 *
 * Data:
 *   GET /api/dashboard/summary   — own totals (customer-scoped server-side)
 *   GET /api/accounts            — own accounts
 *   GET /api/transactions        — last 5
 *   GET /api/fraud/alerts        — open alert count
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building2, CreditCard, ArrowLeftRight,
  Send, ShieldAlert, TrendingUp, RefreshCw, ChevronRight,
} from 'lucide-react';
import { accountService }    from '@/services/accountService';
import { transactionService }from '@/services/transactionService';
import { fraudService }      from '@/services/fraudService';
import { dashboardService }  from '@/services/dashboardService';
import { useAuth }           from '@/context/AuthContext';
import { StatusBadge }       from '@/components/ui/StatusBadge';
import { RiskBadge }         from '@/components/fraud/RiskBadge';
import { Button }            from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { InlineLoader }      from '@/components/ui/LoadingOverlay';

const fmtAmt = (n, cur = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n ?? 0);
const fmtDate = s =>
  s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—';

// ── account colour gradient by type ──────────────────────────────────────────
const ACCT_GRAD = {
  savings          : 'from-blue-600 to-indigo-700',
  current          : 'from-slate-600 to-slate-800',
  salary           : 'from-emerald-600 to-teal-700',
  fixed_deposit    : 'from-amber-600 to-orange-700',
  recurring_deposit: 'from-purple-600 to-violet-700',
  loan             : 'from-red-600 to-rose-700',
  business         : 'from-cyan-600 to-sky-700',
};

const AccountCard = ({ account }) => {
  const grad = ACCT_GRAD[account.account_type] ?? 'from-gray-600 to-gray-800';
  return (
    <Link to={`/portal/accounts/${account.id}`}
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${grad} p-5 text-white shadow-lg hover:shadow-xl transition-shadow cursor-pointer`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-[11px] uppercase tracking-widest opacity-70">
            {account.account_type?.replace(/_/g, ' ')}
          </p>
          <p className="font-mono text-xs opacity-60 mt-0.5">{account.account_number}</p>
        </div>
        <StatusBadge value={account.status}
          className="bg-white/20 border-white/30 text-white text-[10px]" />
      </div>
      <p className="text-2xl font-bold tracking-tight">
        {fmtAmt(account.balance, account.currency)}
      </p>
      <div className="mt-3 flex items-center justify-between text-xs opacity-60">
        <span>{account.branch_code ?? 'Main Branch'}</span>
        <ChevronRight className="h-3.5 w-3.5" />
      </div>
    </Link>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
const CustomerHome = () => {
  const { user }     = useAuth();
  const navigate     = useNavigate();
  const greeting     = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const [accounts, setAccounts]   = useState([]);
  const [txns,     setTxns]       = useState([]);
  const [summary,  setSummary]    = useState(null);
  const [alertCnt, setAlertCnt]   = useState(0);
  const [loading,  setLoading]    = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [acctRes, txnRes, summRes, alertRes] = await Promise.allSettled([
        accountService.list({ limit: 4 }),
        transactionService.list({ limit: 5, sortDir: 'DESC' }),
        dashboardService.getSummary(),
        fraudService.listAlerts({ status: 'open', limit: 1 }),
      ]);

      if (acctRes.status  === 'fulfilled') setAccounts(acctRes.value.data?.data ?? []);
      if (txnRes.status   === 'fulfilled') setTxns(txnRes.value.data?.data ?? []);
      if (summRes.status  === 'fulfilled') setSummary(summRes.value.data);
      if (alertRes.status === 'fulfilled') setAlertCnt(alertRes.value.data?.pagination?.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Greeting ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {greeting}, {user?.firstName}!
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Here&apos;s your financial snapshot for today.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* ── Fraud alert banner ─────────────────────────────────────────────── */}
      {alertCnt > 0 && (
        <Link to="/portal/alerts"
          className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 hover:bg-red-100 transition-colors dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <span>
            You have <strong>{alertCnt}</strong> open fraud alert{alertCnt !== 1 ? 's' : ''} on your account.
          </span>
          <ChevronRight className="ml-auto h-4 w-4" />
        </Link>
      )}

      {loading ? <InlineLoader label="Loading your account…" /> : (
        <>
          {/* ── KPI strip ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label : 'Total Transactions',
                value : (summary?.transactions?.total_30d ?? 0).toLocaleString(),
                sub   : 'last 30 days',
                Icon  : TrendingUp,
                cls   : 'text-blue-600',
              },
              {
                label : 'Todays Activity',
                value : (summary?.transactions?.total_today ?? 0).toLocaleString(),
                sub   : 'transactions today',
                Icon  : ArrowLeftRight,
                cls   : 'text-indigo-500',
              },
              {
                label : 'Active Accounts',
                value : accounts.filter(a => a.status === 'active').length,
                sub   : `of ${accounts.length} total`,
                Icon  : Building2,
                cls   : 'text-emerald-500',
              },
              {
                label : 'Fraud Alerts',
                value : alertCnt,
                sub   : alertCnt > 0 ? 'require attention' : 'all clear',
                Icon  : ShieldAlert,
                cls   : alertCnt > 0 ? 'text-red-500' : 'text-green-500',
              },
            ].map(({ label, value, sub, Icon, cls }) => (
              <Card key={label}>
                <CardContent className="py-4 px-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                    <Icon className={`h-4 w-4 ${cls}`} />
                  </div>
                  <p className={`text-xl font-bold ${cls}`}>{value}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ── Account cards ──────────────────────────────────────────────── */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 dark:text-gray-200">My Accounts</h2>
              <Link to="/portal/accounts">
                <Button variant="ghost" size="sm" className="gap-1 text-xs text-blue-600">
                  View all <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
            {accounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 py-10 text-center text-sm text-gray-400 dark:border-gray-700">
                No accounts found.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {accounts.map(a => <AccountCard key={a.id} account={a} />)}
              </div>
            )}
          </section>

          {/* ── Quick actions ──────────────────────────────────────────────── */}
          <section>
            <h2 className="mb-3 font-semibold text-gray-800 dark:text-gray-200">Quick Actions</h2>
            <div className="flex flex-wrap gap-3">
              {[
                { label: 'Transfer Funds', Icon: Send,           path: '/transfer',          cls: 'bg-blue-600 hover:bg-blue-700 text-white' },
                { label: 'My Accounts',    Icon: Building2,      path: '/portal/accounts',   cls: 'border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800' },
                { label: 'My Cards',       Icon: CreditCard,     path: '/portal/cards',      cls: 'border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800' },
                { label: 'Transactions',   Icon: ArrowLeftRight, path: '/portal/transactions',cls: 'border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800' },
              ].map(({ label, Icon, path, cls }) => (
                <button key={label} onClick={() => navigate(path)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${cls}`}>
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* ── Recent transactions ────────────────────────────────────────── */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-semibold">Recent Transactions</CardTitle>
              <Link to="/portal/transactions">
                <Button variant="ghost" size="sm" className="gap-1 text-xs text-blue-600">
                  See all <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {txns.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">No recent transactions.</p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {txns.map(t => (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                      {/* Icon */}
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                        <ArrowLeftRight className="h-4 w-4 text-gray-500" />
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium capitalize text-gray-800 dark:text-gray-200">
                          {t.txn_type} · {t.channel ?? '—'}
                        </p>
                        <p className="font-mono text-[10px] text-gray-400">{t.transaction_ref}</p>
                      </div>
                      {/* Amount + status */}
                      <div className="shrink-0 text-right">
                        <p className={`text-sm font-semibold ${
                          t.txn_type === 'credit' || t.txn_type === 'deposit'
                            ? 'text-emerald-600' : 'text-gray-800 dark:text-gray-200'
                        }`}>
                          {fmtAmt(t.amount, t.currency)}
                        </p>
                        <div className="mt-0.5 flex items-center justify-end gap-1">
                          <StatusBadge value={t.status} />
                          <RiskBadge score={t.risk_score} showScore={false} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default CustomerHome;
