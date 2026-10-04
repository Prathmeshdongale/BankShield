/**
 * MyAccounts.jsx — /portal/accounts
 *
 * Customer view of their own bank accounts.
 * Server-side JWT scoping ensures only this customer's accounts are returned.
 *
 * Features:
 *   • Account cards with balance, type, status, account number
 *   • Click-through to account detail (/portal/accounts/:id)
 *   • Status filter + refresh
 *   • Loading / empty / error states
 *   • No admin actions (freeze/close/open) — customer role cannot perform them
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link }            from 'react-router-dom';
import { Building2, RefreshCw, ChevronRight, TrendingUp } from 'lucide-react';
import { accountService }  from '@/services/accountService';
import { Button }          from '@/components/ui/button';
import Select              from '@/components/ui/Select';
import { StatusBadge }     from '@/components/ui/StatusBadge';
import { InlineLoader }    from '@/components/ui/LoadingOverlay';
import { ErrorMessage }    from '@/components/ui/ErrorMessage';

const STATUSES = ['', 'active', 'dormant', 'frozen', 'closed', 'pending'];

const fmtAmt = (n, cur = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n ?? 0);
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—';

// gradient per account type
const GRAD = {
  savings          : 'from-blue-600   to-indigo-700',
  current          : 'from-slate-600  to-slate-800',
  salary           : 'from-emerald-600 to-teal-700',
  fixed_deposit    : 'from-amber-600  to-orange-700',
  recurring_deposit: 'from-purple-600 to-violet-700',
  loan             : 'from-red-600    to-rose-700',
  business         : 'from-cyan-600   to-sky-700',
};

// ─────────────────────────────────────────────────────────────────────────────
const MyAccounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [status,   setStatus]   = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await accountService.list({
        status: status || undefined,
        limit: 50,           // customers rarely have >50 accounts
      });
      setAccounts(res.data?.data ?? []);
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to load accounts.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  // total across active accounts
  const totalBalance = accounts
    .filter(a => a.status === 'active')
    .reduce((sum, a) => sum + parseFloat(a.balance ?? 0), 0);

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <Building2 className="h-6 w-6 text-blue-600" /> My Accounts
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Your bank accounts and balances.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* ── Total balance banner ─────────────────────────────────────────── */}
      {!loading && accounts.length > 0 && (
        <div className="flex items-center gap-4 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4 dark:border-blue-900 dark:from-blue-950/40 dark:to-indigo-950/40">
          <TrendingUp className="h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Total Active Balance</p>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {fmtAmt(totalBalance)}
            </p>
          </div>
        </div>
      )}

      {/* ── Filter ──────────────────────────────────────────────────────── */}
      <Select value={status} onChange={e => setStatus(e.target.value)} className="w-40">
        {STATUSES.map(s => (
          <option key={s} value={s}>{s || 'All statuses'}</option>
        ))}
      </Select>

      <ErrorMessage message={error} />

      {/* ── Cards ───────────────────────────────────────────────────────── */}
      {loading ? (
        <InlineLoader label="Loading your accounts…" />
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 py-16 text-gray-400 dark:border-gray-700">
          <Building2 className="h-10 w-10" />
          <p className="text-sm">
            {status ? `No ${status} accounts found.` : 'No accounts found.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map(a => {
            const grad = GRAD[a.account_type] ?? 'from-gray-600 to-gray-800';
            return (
              <Link key={a.id} to={`/portal/accounts/${a.id}`}
                className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br ${grad} p-5 text-white shadow-md hover:shadow-xl transition-all duration-200`}>
                {/* Top row */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-widest opacity-70">
                      {a.account_type?.replace(/_/g, ' ')}
                    </p>
                    <p className="font-mono text-xs opacity-60 mt-0.5">{a.account_number}</p>
                  </div>
                  <StatusBadge value={a.status}
                    className="border-white/30 bg-white/20 text-white text-[10px]" />
                </div>

                {/* Balance */}
                <div className="mt-6">
                  <p className="text-xs opacity-60 uppercase tracking-wide">Available Balance</p>
                  <p className="text-2xl font-bold tracking-tight">
                    {fmtAmt(a.balance, a.currency)}
                  </p>
                </div>

                {/* Bottom meta */}
                <div className="mt-4 flex items-end justify-between border-t border-white/20 pt-3 text-xs opacity-60">
                  <div>
                    <p>Opened {fmtDate(a.opened_at)}</p>
                    {a.branch_code && <p className="mt-0.5">{a.branch_code}</p>}
                  </div>
                  <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyAccounts;
