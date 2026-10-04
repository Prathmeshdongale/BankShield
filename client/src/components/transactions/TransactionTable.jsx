/**
 * TransactionTable — compact read-only table used in Dashboard and AccountDetail.
 * For the full filterable ledger see pages/Transactions.jsx
 */
import React from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AlertTriangle } from 'lucide-react';

const fmtAmt  = (n, cur = 'INR') =>
  new Intl.NumberFormat('en-IN', { style:'currency', currency: cur ?? 'INR', maximumFractionDigits:2 }).format(n ?? 0);

const fmtDate = (s) =>
  s ? new Intl.DateTimeFormat('en-IN', { dateStyle:'medium', timeStyle:'short' }).format(new Date(s)) : '—';

const riskColor = (score) => {
  const s = parseFloat(score ?? 0) * 100;
  if (s >= 80) return 'text-red-600';
  if (s >= 60) return 'text-orange-500';
  if (s >= 30) return 'text-yellow-500';
  return 'text-green-600';
};

export const TransactionTable = ({ transactions = [] }) => (
  <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
    <table className="w-full text-left text-sm">
      <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900 text-xs uppercase text-gray-500 dark:text-gray-400">
        <tr>
          {['Date','Ref','Type','Amount','Status','Risk'].map(h => (
            <th key={h} className="px-4 py-3">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
        {transactions.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
              No transactions recorded yet.
            </td>
          </tr>
        ) : transactions.map(tx => (
          <tr key={tx.id} className="bg-white hover:bg-gray-50/50 dark:bg-gray-900 dark:hover:bg-gray-800/50">
            <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(tx.created_at)}</td>
            <td className="px-4 py-3 font-mono text-xs text-gray-400">{tx.transaction_ref ?? tx.id?.slice(0,8)}</td>
            <td className="px-4 py-3 capitalize text-gray-700 dark:text-gray-300">
              {/* support both old transaction_type and new txn_type */}
              {tx.txn_type ?? tx.transaction_type}
              {tx.is_fraud && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-red-500" />}
            </td>
            <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
              {fmtAmt(tx.amount, tx.currency)}
            </td>
            <td className="px-4 py-3"><StatusBadge value={tx.status} /></td>
            <td className={`px-4 py-3 font-mono text-xs font-semibold ${riskColor(tx.risk_score)}`}>
              {(parseFloat(tx.risk_score ?? 0) * 100).toFixed(1)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default TransactionTable;
