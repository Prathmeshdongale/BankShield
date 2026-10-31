/**
 * Transactions.jsx — /transactions
 * Paginated ledger with filters + slide-in detail drawer.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight, RefreshCw, Filter, X,
  ChevronUp, ChevronDown, AlertTriangle, Plus
} from 'lucide-react';
import { useTransactions }  from '@/hooks/useTransactions';
import { Button }           from '@/components/ui/button';
import { Input }            from '@/components/ui/input';
import Select               from '@/components/ui/Select';
import { StatusBadge }      from '@/components/ui/StatusBadge';
import { Pagination }       from '@/components/ui/Pagination';
import { InlineLoader }     from '@/components/ui/LoadingOverlay';
import { ErrorMessage }     from '@/components/ui/ErrorMessage';
import TransactionDrawer    from '@/pages/transactions/TransactionDrawer';
import { AddTransactionModal } from '@/components/transactions/AddTransactionModal';

const TXN_TYPES  = ['','credit','debit','transfer','deposit','withdrawal','payment','reversal','fee'];
const STATUSES   = ['','pending','processing','completed','failed','flagged','blocked','reversed'];
const CHANNELS   = ['','web','mobile','atm','pos','branch','upi','neft','rtgs','imps','api'];

const fmtAmt = (n, cur = 'INR') =>
  new Intl.NumberFormat('en-IN', { style:'currency', currency: cur, maximumFractionDigits:2 }).format(n ?? 0);

const fmtDate = (s) => s ? new Date(s).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' }) : '—';

export const Transactions = () => {
  const { transactions, pagination, loading, error, filters, setFilters, refetch } =
    useTransactions();

  const [showFilters, setShowFilters] = useState(false);
  const [selected,    setSelected]    = useState(null);  // transaction for drawer
  const [showAddTxn,  setShowAddTxn]  = useState(false);

  const clearFilters = () =>
    setFilters({ status:'', txnType:'', channel:'', dateFrom:'', dateTo:'', isFraud:'', page:1 });

  const hasActive = filters.status || filters.txnType || filters.channel ||
                    filters.dateFrom || filters.dateTo || filters.isFraud;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <ArrowLeftRight className="h-6 w-6 text-blue-600" />
            Transactions
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Append-only ledger — all transactions, scored by the XGBoost fraud engine.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => setShowAddTxn(true)}
            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          >
            <Plus className="h-4 w-4" /> Add Transaction
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(f => !f)}
            className={`gap-1.5 ${hasActive ? 'border-blue-500 text-blue-600' : ''}`}>
            <Filter className="h-3.5 w-3.5" />
            Filters
            {hasActive && <span className="ml-1 rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">!</span>}
          </Button>
          <Button variant="outline" size="sm" onClick={refetch} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Filters</p>
            {hasActive && (
              <Button variant="ghost" size="sm" onClick={clearFilters}
                className="gap-1 text-xs text-gray-500">
                <X className="h-3 w-3" /> Clear all
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Select value={filters.status} onChange={e => setFilters({ status: e.target.value })}>
              {STATUSES.map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}
            </Select>
            <Select value={filters.txnType} onChange={e => setFilters({ txnType: e.target.value })}>
              {TXN_TYPES.map(t => <option key={t} value={t}>{t || 'All types'}</option>)}
            </Select>
            <Select value={filters.channel} onChange={e => setFilters({ channel: e.target.value })}>
              {CHANNELS.map(c => <option key={c} value={c}>{c || 'All channels'}</option>)}
            </Select>
            <Input type="date" value={filters.dateFrom}
              onChange={e => setFilters({ dateFrom: e.target.value })}
              placeholder="From date"
              className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
            <Input type="date" value={filters.dateTo}
              onChange={e => setFilters({ dateTo: e.target.value })}
              placeholder="To date"
              className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
            <Select value={filters.isFraud} onChange={e => setFilters({ isFraud: e.target.value })}>
              <option value="">Fraud: all</option>
              <option value="true">Fraud only</option>
              <option value="false">Legit only</option>
            </Select>
          </div>
        </div>
      )}

      <ErrorMessage message={error} />

      {loading ? <InlineLoader label="Loading transactions…" /> : (
        <>
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
              <ArrowLeftRight className="h-10 w-10" />
              <p className="text-sm">No transactions found.</p>
              {hasActive && <p className="text-xs">Try clearing your filters.</p>}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900 text-left">
                    {['Ref','Type','Amount','Status','Channel','Risk','Source → Dest','Date'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {transactions.map(t => {
                    const risk = parseFloat(t.risk_score ?? 0);
                    const riskColor = risk >= 0.80 ? 'text-red-600' : risk >= 0.60 ? 'text-orange-500' : risk >= 0.30 ? 'text-yellow-500' : 'text-green-600';
                    return (
                      <tr key={t.id}
                        onClick={() => setSelected(t)}
                        className="cursor-pointer bg-white hover:bg-blue-50/40 dark:bg-gray-900 dark:hover:bg-gray-800/60">
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.transaction_ref}</td>
                        <td className="px-4 py-3 capitalize text-gray-700 dark:text-gray-300">
                          {t.txn_type}
                          {t.is_fraud && (
                            <AlertTriangle className="ml-1.5 inline h-3.5 w-3.5 text-red-500" />
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                          {fmtAmt(t.amount, t.currency)}
                        </td>
                        <td className="px-4 py-3"><StatusBadge value={t.status} /></td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{t.channel ?? '—'}</td>
                        <td className={`px-4 py-3 font-mono text-xs font-semibold ${riskColor}`}>
                          {(risk * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">
                          {t.source_account_number ?? '—'}
                          {t.dest_account_number && (
                            <span className="mx-1 text-gray-300">→</span>
                          )}
                          {t.dest_account_number}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                          {fmtDate(t.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {pagination && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{pagination.total} transaction{pagination.total !== 1 ? 's' : ''}</span>
              <Pagination page={pagination.page} pages={pagination.pages}
                onPage={p => setFilters({ page: p })} />
            </div>
          )}
        </>
      )}

      {/* Detail drawer */}
      <TransactionDrawer txn={selected} onClose={() => setSelected(null)} />

      {/* Add & Simulate Transaction Modal */}
      <AddTransactionModal
        open={showAddTxn}
        onClose={() => setShowAddTxn(false)}
        onSuccess={refetch}
      />
    </div>
  );
};

export default Transactions;
