/**
 * CustomerDashboard.jsx — Customer self-service dashboard.
 * Shows account overview, balances, recent activity, and quick actions.
 * Fetches live data from authenticated customer endpoints.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  CreditCard, TrendingUp, AlertTriangle, ShieldCheck,
  ArrowLeftRight, RefreshCw, Building2, ChevronRight, Send,
  ShieldAlert, Clock, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge }   from '@/components/ui/StatusBadge';
import { RiskBadge }     from '@/components/fraud/RiskBadge';
import { InlineLoader }  from '@/components/ui/LoadingOverlay';
import { ErrorMessage }  from '@/components/ui/ErrorMessage';
import { Button }        from '@/components/ui/button';
import { accountService }     from '@/services/accountService';
import { transactionService } from '@/services/transactionService';
import { fraudService }       from '@/services/fraudService';
import { dashboardService }   from '@/services/dashboardService';

const fmtAmt = (n, cur = 'INR') => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: cur, maximumFractionDigits: 2,
}).format(n ?? 0);

const fmtDate = (s) => s
  ? new Date(s).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
  : '—';

const CustomerDashboard = () => {
  const { user } = useAuth();
  const [accounts,     setAccounts]     = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [summary,      setSummary]      = useState(null);
  const [alertCount,   setAlertCount]   = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [acctRes, txnRes, summRes, alertRes] = await Promise.allSettled([
        accountService.list({ limit: 10 }),
        transactionService.list({ limit: 6, sortDir: 'DESC' }),
        dashboardService.getSummary(),
        fraudService.listAlerts({ status: 'open', limit: 5 }),
      ]);

      if (acctRes.status === 'fulfilled') {
        setAccounts(acctRes.value.data?.data ?? acctRes.value.data ?? []);
      }
      if (txnRes.status === 'fulfilled') {
        setTransactions(txnRes.value.data?.data ?? txnRes.value.data ?? []);
      }
      if (summRes.status === 'fulfilled') {
        setSummary(summRes.value.data ?? null);
      }
      if (alertRes.status === 'fulfilled') {
        setAlertCount(alertRes.value.data?.pagination?.total ?? alertRes.value.data?.data?.length ?? 0);
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalBalance = accounts.reduce((sum, acc) => sum + (parseFloat(acc.balance) || 0), 0);
  const activeAccounts = accounts.filter(a => a.status === 'active');

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <InlineLoader label="Loading your dashboard…" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {greeting}, {user?.name || user?.firstName || 'Customer'}!
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Welcome to your BankShield personal banking portal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Link to="/transfer">
            <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
              <Send className="h-3.5 w-3.5" /> Transfer Funds
            </Button>
          </Link>
        </div>
      </div>

      {error && <ErrorMessage message={error} retry={loadData} />}

      {/* Security alert banner if any open alerts */}
      {alertCount > 0 && (
        <Link
          to="/portal/alerts"
          className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            You have <strong>{alertCount}</strong> open security alert{alertCount !== 1 ? 's' : ''} on your accounts.
          </span>
          <ChevronRight className="ml-auto h-4 w-4" />
        </Link>
      )}

      {/* KPI Overview Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Balance
            </CardTitle>
            <CreditCard className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {fmtAmt(totalBalance)}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Across {accounts.length} account{accounts.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Active Accounts
            </CardTitle>
            <Building2 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {activeAccounts.length}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {accounts.length - activeAccounts.length > 0
                ? `${accounts.length - activeAccounts.length} restricted/closed`
                : 'All accounts in good standing'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Transactions
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {summary?.transactions?.total_30d ?? transactions.length}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Last 30 days activity
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Security Status
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {alertCount === 0 ? 'Protected' : 'Alert Flagged'}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {alertCount === 0 ? 'Real-time ML shielding active' : `${alertCount} pending review`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Accounts List Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">Your Accounts</CardTitle>
          <Link to="/portal/accounts">
            <Button variant="ghost" size="sm" className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
              Manage accounts <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {accounts.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <Building2 className="mx-auto h-8 w-8 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No bank accounts linked to your profile yet.</p>
              <p className="text-xs text-gray-400 mt-0.5">Please contact your branch manager to open a savings or current account.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left dark:border-gray-800 dark:bg-gray-900/60">
                    <th className="px-5 py-3 font-semibold uppercase tracking-wide text-gray-500">Account Number</th>
                    <th className="px-5 py-3 font-semibold uppercase tracking-wide text-gray-500">Type</th>
                    <th className="px-5 py-3 font-semibold uppercase tracking-wide text-gray-500">Currency</th>
                    <th className="px-5 py-3 font-semibold uppercase tracking-wide text-gray-500">Available Balance</th>
                    <th className="px-5 py-3 font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    <th className="px-5 py-3 font-semibold uppercase tracking-wide text-gray-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {accounts.map((acc) => (
                    <tr key={acc.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                      <td className="px-5 py-3 font-mono font-medium text-gray-900 dark:text-gray-100">
                        {acc.account_number}
                      </td>
                      <td className="px-5 py-3 capitalize text-gray-600 dark:text-gray-300">
                        {acc.account_type?.replace(/_/g, ' ')}
                      </td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-400">
                        {acc.currency || 'INR'}
                      </td>
                      <td className="px-5 py-3 font-semibold text-gray-900 dark:text-white">
                        {fmtAmt(acc.balance, acc.currency)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge value={acc.status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link to={`/portal/accounts/${acc.id}`}>
                          <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
                            Details
                          </Button>
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

      {/* Recent Activity Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">Recent Transactions</CardTitle>
          <Link to="/portal/transactions">
            <Button variant="ghost" size="sm" className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
              View all history <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <ArrowLeftRight className="mx-auto h-8 w-8 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No transaction activity recorded yet.</p>
              <Link to="/transfer" className="mt-2 inline-block">
                <Button size="sm" variant="outline" className="text-xs">
                  Make your first transfer
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left dark:border-gray-800 dark:bg-gray-900/60">
                    <th className="px-5 py-3 font-semibold uppercase tracking-wide text-gray-500">Reference</th>
                    <th className="px-5 py-3 font-semibold uppercase tracking-wide text-gray-500">Date</th>
                    <th className="px-5 py-3 font-semibold uppercase tracking-wide text-gray-500">Type</th>
                    <th className="px-5 py-3 font-semibold uppercase tracking-wide text-gray-500">Channel</th>
                    <th className="px-5 py-3 font-semibold uppercase tracking-wide text-gray-500">Amount</th>
                    <th className="px-5 py-3 font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    <th className="px-5 py-3 font-semibold uppercase tracking-wide text-gray-500">Risk Assessment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                      <td className="px-5 py-3 font-mono font-medium text-gray-800 dark:text-gray-200">
                        {t.transaction_ref || t.id.slice(0, 8)}
                      </td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400">
                        {fmtDate(t.created_at)}
                      </td>
                      <td className="px-5 py-3 capitalize text-gray-700 dark:text-gray-300">
                        {t.txn_type}
                      </td>
                      <td className="px-5 py-3 uppercase text-[11px] text-gray-500 dark:text-gray-400">
                        {t.channel || 'web'}
                      </td>
                      <td className="px-5 py-3 font-semibold text-gray-900 dark:text-gray-100">
                        {fmtAmt(t.amount, t.currency)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge value={t.status} />
                      </td>
                      <td className="px-5 py-3">
                        <RiskBadge score={t.risk_score} level={t.risk_score >= 0.8 ? 'CRITICAL' : t.risk_score >= 0.6 ? 'HIGH' : t.risk_score >= 0.3 ? 'MEDIUM' : 'LOW'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Navigation Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link to="/transfer">
          <Card className="cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 transition-colors">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="rounded-xl bg-blue-100 p-3 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                <Send className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Transfer Funds</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Instant internal or NEFT/RTGS transfer</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/portal/cards">
          <Card className="cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-600 transition-colors">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="rounded-xl bg-emerald-100 p-3 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <CreditCard className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Manage Cards</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">View limits, block or report lost cards</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/portal/alerts">
          <Card className="cursor-pointer hover:border-amber-400 dark:hover:border-amber-600 transition-colors">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="rounded-xl bg-amber-100 p-3 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Security & Alerts</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Review AI fraud alerts & activity</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
};

export default CustomerDashboard;
