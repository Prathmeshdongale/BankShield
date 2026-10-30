/**
 * MyTransactions.jsx — /portal/transactions
 *
 * Customer-facing paginated transaction history.
 * Server JWT scoping ensures only their own transactions are returned.
 *
 * Filters: type, status, date range, search (account number / ref)
 * Click any row → TransactionDrawer slide-out detail panel.
 * "Make a Transfer" quick-link for customers.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link }                from 'react-router-dom';
import { ArrowLeftRight, RefreshCw, Send, Search } from 'lucide-react';
import { transactionService }  from '@/services/transactionService';
import { RiskBadge }           from '@/components/fraud/RiskBadge';
import { StatusBadge }         from '@/components/ui/StatusBadge';
import { Button }              from '@/components/ui/button';
import { Input }               from '@/components/ui/input';
import Select                  from '@/components/ui/Select';
import { Pagination }          from '@/components/ui/Pagination';
import { InlineLoader }        from '@/components/ui/LoadingOverlay';
import { ErrorMessage }        from '@/components/ui/ErrorMessage';
import TransactionDrawer       from '@/pages/transactions/TransactionDrawer';

// ── constants ─────────────────────────────────────────────────────────────────
const TXN_TYPES = ['', 'credit', 'debit', 'transfer', 'deposit', 'withdrawal', 'payment', 'reversal', 'fee', 'interest'];
const TXN_STATUSES = ['', 'pending', 'processing', 'completed', 'failed', 'flagged', 'blocked', 'reversed'];
const LIMIT = 20;

const fmtAmt  = (n, cur = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n ?? 0);
const fmtDate = s =>
  s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—';

// Colour amount by direction
const amtCls = (type) =>
  ['credit', 'deposit', 'interest'].includes(type) ? 'text-emerald-600 font-semibold' : 'text-gray-800 dark:text-gray-200 font-medium';

// ─────────────────────────────────────────────────────────────────────────────
const MyTransactions = () => {
  const [txns,       setTxns]       = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  // Filters
  const [search,    setSearch]    = useState('');
  const [txnType,   setTxnType]   = useState('');
  const [status,    setStatus]    = useState('');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [page,      setPage]      = useState(1);

  // Drawer
  const [selTxn, setSelTxn] = useState(null);

  const load = useCallback(async (pg = page) => {
    setLoading(true); setError('');
    try {
      const res = await transactionService.list({
        search   : search   || undefined,
        txnType  : txnType  || undefined,
        status   : status   || undefined,
        dateFrom : dateFrom || undefined,
        dateTo   : dateTo   || undefined,
        limit    : LIMIT,
        offset   : (pg - 1) * LIMIT,
        sortDir  : 'DESC',
      });
      setTxns(txns => pg === 1 ? (res.data?.data ?? []) : res.data?.data ?? []);
      // re-assign cleanly
      setTxns(res.data?.data ?? []);
      setPagination(res.data?.pagination ?? null);
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to load transactions.');
    } finally {
      setLoading(false);
    }
  }, [search, txnType, status, dateFrom, dateTo, page]); // eslint-disable-line

  useEffect(() => { load(page); }, [search, txnType, status, dateFrom, dateTo, page]); // eslint-disable-line

  const resetFilters = () => {
    setSearch(''); setTxnType(''); setStatus('');
    setDateFrom(''); setDateTo(''); setPage(1);
  };

  const hasFilters = search || txnType || status || dateFrom || dateTo;

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <ArrowLeftRight className="h-6 w-6 text-blue-600" /> My Transactions
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Your complete transaction history.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/portal/alerts">
            <Button variant="outline" size="sm" className="gap-1.5 border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300">
              <ShieldAlert className="h-4 w-4 text-amber-600" /> Security Alerts
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by transaction ref or account number…"
            className="pl-9 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>

        {/* Type + Status + Date range */}
        <div className="flex flex-wrap gap-3">
          <Select value={txnType} onChange={e => { setTxnType(e.target.value); setPage(1); }} className="w-36">
            {TXN_TYPES.map(t => (
              <option key={t} value={t}>{t || 'All types'}</option>
            ))}
          </Select>

          <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-36">
            {TXN_STATUSES.map(s => (
              <option key={s} value={s}>{s || 'All statuses'}</option>
            ))}
          </Select>

          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              className="w-36 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              title="From date"
            />
            <span className="text-gray-400 text-sm">→</span>
            <Input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1); }}
              className="w-36 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              title="To date"
            />
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="text-gray-500">
              Clear filters
            </Button>
          )}
        </div>
      </div>

      <ErrorMessage message={error} />

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <InlineLoader label="Loading transactions…" />
      ) : txns.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 py-16 text-gray-400 dark:border-gray-700">
          <ArrowLeftRight className="h-10 w-10" />
          <p className="text-sm">{hasFilters ? 'No transactions match your filters.' : 'No transactions yet.'}</p>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>Clear filters</Button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900 text-left">
                  {['Date', 'Ref', 'Type', 'Amount', 'Channel', 'Status', 'Risk'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {txns.map(t => (
                  <tr key={t.id}
                    onClick={() => setSelTxn(t)}
                    className="cursor-pointer bg-white hover:bg-blue-50/30 dark:bg-gray-900 dark:hover:bg-gray-800/60 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {fmtDate(t.created_at)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-gray-500">
                      {t.transaction_ref}
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-700 dark:text-gray-300">
                      {t.txn_type}
                    </td>
                    <td className={`px-4 py-3 ${amtCls(t.txn_type)}`}>
                      {['credit','deposit','interest'].includes(t.txn_type) ? '+' : '−'}{fmtAmt(t.amount, t.currency)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {t.channel ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={t.status} />
                    </td>
                    <td className="px-4 py-3">
                      <RiskBadge score={t.risk_score} showScore={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination + count */}
          {pagination && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{pagination.total?.toLocaleString()} transaction{pagination.total !== 1 ? 's' : ''}</span>
              <Pagination
                page={pagination.page}
                pages={pagination.pages}
                onPage={p => setPage(p)}
              />
            </div>
          )}
        </>
      )}

      {/* ── Transaction detail drawer ────────────────────────────────────────── */}
      <TransactionDrawer txn={selTxn} onClose={() => setSelTxn(null)} />
    </div>
  );
};

export default MyTransactions;
