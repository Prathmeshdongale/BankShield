/**
 * TransactionDrawer — slide-in panel showing full transaction detail.
 * Opens when user clicks a row in the transaction table.
 */
import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, CheckCircle, Clock, Ban } from 'lucide-react';
import { transactionService } from '@/services/transactionService';
import { StatusBadge }        from '@/components/ui/StatusBadge';
import { InlineLoader }       from '@/components/ui/LoadingOverlay';
import { cn }                 from '@/utils/cn';

const fmtAmt  = (n, cur = 'INR') =>
  new Intl.NumberFormat('en-IN', { style:'currency', currency: cur, maximumFractionDigits:2 }).format(n ?? 0);
const fmtDate = (s) => s ? new Date(s).toLocaleString('en-IN', { dateStyle:'long', timeStyle:'short' }) : '—';

const Row = ({ label, value }) => (
  <div className="flex gap-3 border-b border-gray-100 py-2.5 last:border-0 dark:border-gray-800">
    <span className="w-40 shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
    <span className="min-w-0 break-words text-sm text-gray-900 dark:text-gray-200">{value ?? '—'}</span>
  </div>
);

const RISK_TIER = (score) => {
  const s = parseFloat(score ?? 0) * 100;
  if (s >= 80) return { label:'CRITICAL', color:'text-red-600',    bg:'bg-red-100 dark:bg-red-950/40',    icon: Ban };
  if (s >= 60) return { label:'HIGH',     color:'text-orange-600', bg:'bg-orange-100 dark:bg-orange-950/30', icon: AlertTriangle };
  if (s >= 30) return { label:'MEDIUM',   color:'text-yellow-600', bg:'bg-yellow-100 dark:bg-yellow-950/30', icon: Clock };
  return             { label:'LOW',       color:'text-green-600',  bg:'bg-green-100 dark:bg-green-950/30',   icon: CheckCircle };
};

const TransactionDrawer = ({ txn, onClose }) => {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!txn) { setDetail(null); return; }
    setDetail(txn);  // show row data immediately
    setLoading(true);
    transactionService.get(txn.id)
      .then(r => setDetail(r.data?.transaction ?? txn))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [txn?.id]); // eslint-disable-line

  // Close on Escape
  useEffect(() => {
    if (!txn) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [txn, onClose]);

  return (
    <>
      {/* Backdrop */}
      {txn && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={onClose} aria-hidden />
      )}

      {/* Panel */}
      <aside className={cn(
        'fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl transition-transform duration-300',
        'dark:border-gray-800 dark:bg-gray-900',
        txn ? 'translate-x-0' : 'translate-x-full'
      )}>
        {txn && detail && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <div>
                <p className="font-mono text-xs text-gray-400">{detail.transaction_ref}</p>
                <p className="mt-0.5 text-base font-bold text-gray-900 capitalize dark:text-white">
                  {detail.txn_type} · {fmtAmt(detail.amount, detail.currency)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge value={detail.status} />
                <button onClick={onClose} className="ml-2 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {loading && <div className="p-4"><InlineLoader /></div>}

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {/* Risk banner */}
              {(() => {
                const tier = RISK_TIER(detail.risk_score);
                const Icon = tier.icon;
                return (
                  <div className={cn('flex items-center gap-3 rounded-xl px-4 py-3', tier.bg)}>
                    <Icon className={cn('h-5 w-5 shrink-0', tier.color)} />
                    <div>
                      <p className={cn('text-sm font-bold', tier.color)}>
                        {tier.label} RISK — {(parseFloat(detail.risk_score ?? 0) * 100).toFixed(1)}%
                      </p>
                      {detail.is_fraud && (
                        <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                          ⚠ Classified as fraud by ML model
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Amounts */}
              <section>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Amount</p>
                <Row label="Amount"          value={fmtAmt(detail.amount, detail.currency)} />
                <Row label="Currency"        value={detail.currency} />
                {detail.amount_in_base && detail.exchange_rate !== '1.000000' && (
                  <Row label="Base Amount"   value={fmtAmt(detail.amount_in_base, 'INR')} />
                )}
                {detail.exchange_rate && detail.exchange_rate !== '1.000000' && (
                  <Row label="Exchange Rate" value={detail.exchange_rate} />
                )}
              </section>

              {/* Accounts */}
              <section>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Accounts</p>
                <Row label="Source"      value={detail.source_account_number  ?? detail.source_account_id} />
                <Row label="Destination" value={detail.dest_account_number    ?? detail.destination_account_id} />
                {detail.merchant_name    && <Row label="Merchant"      value={detail.merchant_name} />}
                {detail.merchant_category && <Row label="Category"    value={detail.merchant_category} />}
              </section>

              {/* Context */}
              <section>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Context</p>
                <Row label="Channel"     value={detail.channel} />
                <Row label="IP Address"  value={detail.ip_address} />
                <Row label="Location"    value={[detail.location_city, detail.location_country].filter(Boolean).join(', ')} />
                {detail.description      && <Row label="Description" value={detail.description} />}
              </section>

              {/* Timestamps */}
              <section>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Timestamps</p>
                <Row label="Created"     value={fmtDate(detail.created_at)} />
                <Row label="Completed"   value={fmtDate(detail.completed_at)} />
                {detail.flagged_at  && <Row label="Flagged"  value={fmtDate(detail.flagged_at)} />}
                {detail.reversed_at && <Row label="Reversed" value={fmtDate(detail.reversed_at)} />}
              </section>
            </div>
          </>
        )}
      </aside>
    </>
  );
};

export default TransactionDrawer;
