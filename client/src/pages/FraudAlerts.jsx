/**
 * FraudAlerts.jsx — /fraud/alerts
 * Paginated alert queue with filters, risk badges, and slide-out detail drawer.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ShieldAlert, RefreshCw, FileSearch } from 'lucide-react';
import { fraudService }   from '@/services/fraudService';
import { RiskBadge }      from '@/components/fraud/RiskBadge';
import { StatusBadge }    from '@/components/ui/StatusBadge';
import { Button }         from '@/components/ui/button';
import Select             from '@/components/ui/Select';
import { Pagination }     from '@/components/ui/Pagination';
import { InlineLoader }   from '@/components/ui/LoadingOverlay';
import { ErrorMessage }   from '@/components/ui/ErrorMessage';
import AlertDetail        from '@/pages/fraud/AlertDetail';

const STATUSES   = ['','open','investigating','escalated','confirmed_fraud','false_positive','resolved','closed'];
const SEVERITIES = ['','low','medium','high','critical'];
const LIMIT = 20;

const severityBorder = { critical:'border-l-red-500', high:'border-l-orange-400', medium:'border-l-yellow-400', low:'border-l-green-400' };

const fmtDate = s => s ? new Date(s).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}) : '—';
const fmtAmt  = (n,c='INR') => new Intl.NumberFormat('en-IN',{style:'currency',currency:c,maximumFractionDigits:2}).format(n??0);

export const FraudAlerts = () => {
  const [sp, setSp]  = useSearchParams();
  const [alerts,     setAlerts]     = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [status,     setStatus]     = useState(sp.get('status')   ?? '');
  const [severity,   setSeverity]   = useState(sp.get('severity') ?? '');
  const [page,       setPage]       = useState(parseInt(sp.get('page') ?? '1', 10));
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async (pg = page) => {
    setLoading(true); setError('');
    try {
      const res = await fraudService.listAlerts({
        status:   status   || undefined,
        severity: severity || undefined,
        limit: LIMIT, offset: (pg-1)*LIMIT,
      });
      setAlerts(res.data?.data ?? []);
      setPagination(res.data?.pagination ?? null);
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to load alerts.');
    } finally { setLoading(false); }
  }, [status, severity, page]);

  useEffect(() => { load(page); }, [status, severity, page]); // eslint-disable-line

  const changePage = p => {
    setPage(p);
    setSp({ status, severity, page: String(p) }, { replace: true });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <ShieldAlert className="h-6 w-6 text-red-500" /> Fraud Alert Queue
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Suspicious transactions triaged by the XGBoost fraud engine.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/fraud/investigations">
            <Button variant="outline" size="sm" className="gap-1.5">
              <FileSearch className="h-3.5 w-3.5" /> Investigations
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading}
            className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading?'animate-spin':''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-44">
          {STATUSES.map(s => <option key={s} value={s}>{s||'All statuses'}</option>)}
        </Select>
        <Select value={severity} onChange={e => { setSeverity(e.target.value); setPage(1); }} className="w-36">
          {SEVERITIES.map(s => <option key={s} value={s}>{s||'All severities'}</option>)}
        </Select>
      </div>

      <ErrorMessage message={error} />

      {loading ? <InlineLoader label="Loading alerts…" /> : (
        <>
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
              <ShieldAlert className="h-10 w-10" />
              <p className="text-sm">No alerts found. The queue is clear!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map(a => {
                const sev = a.severity ?? 'medium';
                return (
                  <div key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`cursor-pointer rounded-xl border border-l-4 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:bg-gray-900 dark:border-gray-800
                      ${severityBorder[sev] ?? 'border-l-gray-300'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      {/* Left */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <RiskBadge score={a.risk_score} />
                          <StatusBadge value={a.status} />
                          <StatusBadge value={a.severity} />
                          <span className="font-mono text-xs text-gray-400">{a.transaction_ref}</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                          {fmtAmt(a.amount, a.currency)} · {a.txn_type ?? a.txn_type} via {a.channel ?? '—'}
                        </p>
                        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                          <span>Acct: {a.source_account_number ?? '—'}</span>
                          {a.analyst_email && <span>Analyst: {a.analyst_email}</span>}
                          <span>{fmtDate(a.created_at)}</span>
                        </div>
                        {/* Trigger reasons */}
                        {a.trigger_reasons && (() => {
                          const tr = typeof a.trigger_reasons === 'string'
                            ? (() => { try { return JSON.parse(a.trigger_reasons); } catch { return []; } })()
                            : a.trigger_reasons;
                          return tr.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {tr.slice(0,4).map(r => (
                                <span key={r} className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700 dark:bg-red-950/30 dark:text-red-400">
                                  {r}
                                </span>
                              ))}
                              {tr.length > 4 && (
                                <span className="text-[10px] text-gray-400">+{tr.length-4} more</span>
                              )}
                            </div>
                          ) : null;
                        })()}
                      </div>
                      {/* Right */}
                      <Button size="sm" variant="outline" className="shrink-0"
                        onClick={e => { e.stopPropagation(); setSelectedId(a.id); }}>
                        Review
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {pagination && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{pagination.total} alert{pagination.total!==1?'s':''}</span>
              <Pagination page={pagination.page} pages={pagination.pages} onPage={changePage} />
            </div>
          )}
        </>
      )}

      {/* Detail drawer */}
      <AlertDetail
        alertId={selectedId}
        onClose={() => setSelectedId(null)}
        onRefresh={() => load(page)}
      />
    </div>
  );
};

export default FraudAlerts;
