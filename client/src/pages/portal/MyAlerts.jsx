/**
 * MyAlerts.jsx — /portal/alerts
 *
 * Customer-facing fraud alert view.
 * Customers have fraud:read_alerts permission — read-only.
 * No status transitions, no assign, no freeze actions shown.
 *
 * Shows:
 *   • All open + investigating alerts for this customer's accounts
 *   • Risk badge, severity, trigger reasons
 *   • Timeline of when the alert was created / reviewed / resolved
 *   • Informational banner explaining what a fraud alert means
 */
import React, { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, RefreshCw, Info, CheckCircle2, Clock } from 'lucide-react';
import { fraudService }  from '@/services/fraudService';
import { RiskBadge }     from '@/components/fraud/RiskBadge';
import { StatusBadge }   from '@/components/ui/StatusBadge';
import { Button }        from '@/components/ui/button';
import Select            from '@/components/ui/Select';
import { Pagination }    from '@/components/ui/Pagination';
import { InlineLoader }  from '@/components/ui/LoadingOverlay';
import { ErrorMessage }  from '@/components/ui/ErrorMessage';

const STATUSES = ['', 'open', 'investigating', 'escalated', 'confirmed_fraud', 'false_positive', 'resolved', 'closed'];
const LIMIT = 20;

const fmtAmt  = (n, cur = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n ?? 0);
const fmtDate = s =>
  s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : null;

// severity left-border colour
const SEV_BORDER = {
  critical: 'border-l-red-500',
  high    : 'border-l-orange-400',
  medium  : 'border-l-yellow-400',
  low     : 'border-l-green-400',
};

// status → friendly message for customers
const STATUS_MSG = {
  open            : 'Our fraud team is reviewing this alert.',
  investigating   : 'A fraud analyst is actively investigating.',
  escalated       : 'This case has been escalated for urgent review.',
  confirmed_fraud : 'Fraud has been confirmed. Your account has been secured.',
  false_positive  : 'This alert was reviewed and cleared — no fraud detected.',
  resolved        : 'This case has been resolved.',
  closed          : 'This case is closed.',
};

// ─────────────────────────────────────────────────────────────────────────────
const MyAlerts = () => {
  const [alerts,     setAlerts]     = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [status,     setStatus]     = useState('');
  const [page,       setPage]       = useState(1);

  const load = useCallback(async (pg = page) => {
    setLoading(true); setError('');
    try {
      const res = await fraudService.listAlerts({
        status: status || undefined,
        limit : LIMIT,
        offset: (pg - 1) * LIMIT,
      });
      setAlerts(res.data?.data ?? []);
      setPagination(res.data?.pagination ?? null);
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to load alerts.');
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => { load(page); }, [status, page]); // eslint-disable-line

  const openCount = pagination?.total ?? alerts.length;

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <ShieldAlert className="h-6 w-6 text-red-500" /> Security Alerts
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Fraud and security alerts on your accounts.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* ── Explainer banner ─────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-800 dark:bg-blue-950/30">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <p className="text-blue-800 dark:text-blue-300">
          <strong>What are security alerts?</strong> Our AI fraud engine monitors every transaction on
          your account in real time. When unusual activity is detected, an alert is raised and
          reviewed by our fraud team. You&apos;ll see the status of each alert here.
          If you believe a transaction was unauthorised, please contact support immediately.
        </p>
      </div>

      {/* ── All-clear banner ─────────────────────────────────────────────────── */}
      {!loading && !error && openCount === 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800 dark:bg-green-950/30">
          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800 dark:text-green-300">All clear!</p>
            <p className="text-xs text-green-700 dark:text-green-400">
              {status ? 'No alerts match your filter.' : 'No fraud alerts on your accounts. Your accounts are secure.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Filter ──────────────────────────────────────────────────────────── */}
      <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-48">
        {STATUSES.map(s => (
          <option key={s} value={s}>{s ? s.replace(/_/g, ' ') : 'All statuses'}</option>
        ))}
      </Select>

      <ErrorMessage message={error} />

      {/* ── Alert list ──────────────────────────────────────────────────────── */}
      {loading ? (
        <InlineLoader label="Loading alerts…" />
      ) : alerts.length > 0 ? (
        <>
          <div className="space-y-3">
            {alerts.map(a => {
              const triggers = (() => {
                try {
                  return typeof a.trigger_reasons === 'string'
                    ? JSON.parse(a.trigger_reasons)
                    : (a.trigger_reasons ?? []);
                } catch { return []; }
              })();

              return (
                <div key={a.id}
                  className={`rounded-xl border border-l-4 bg-white p-5 shadow-sm dark:bg-gray-900 dark:border-gray-800 ${SEV_BORDER[a.severity] ?? 'border-l-gray-300'}`}>

                  {/* Top row */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <RiskBadge score={a.risk_score} />
                      <StatusBadge value={a.severity} />
                      <StatusBadge value={a.status} />
                    </div>
                    <span className="font-mono text-xs text-gray-400">
                      {a.transaction_ref ?? a.id?.slice(0, 8)}
                    </span>
                  </div>

                  {/* Amount + channel */}
                  <p className="mt-3 text-base font-semibold text-gray-800 dark:text-gray-200">
                    {fmtAmt(a.amount, a.currency)}
                    {a.txn_type && <span className="ml-2 text-sm font-normal capitalize text-gray-500">{a.txn_type}</span>}
                    {a.channel  && <span className="ml-1 text-sm font-normal text-gray-400">via {a.channel}</span>}
                  </p>

                  {/* Status message */}
                  {STATUS_MSG[a.status] && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <Clock className="h-3 w-3 shrink-0" />
                      {STATUS_MSG[a.status]}
                    </p>
                  )}

                  {/* Trigger reasons */}
                  {triggers.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {triggers.map(r => (
                        <span key={r}
                          className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/30 dark:text-red-400">
                          {r}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Timeline */}
                  <div className="mt-3 flex flex-wrap gap-4 border-t border-gray-100 pt-3 text-[11px] text-gray-400 dark:border-gray-800">
                    <span>Detected: {fmtDate(a.created_at) ?? '—'}</span>
                    {a.first_reviewed_at && <span>Reviewed: {fmtDate(a.first_reviewed_at)}</span>}
                    {a.resolved_at       && <span>Resolved: {fmtDate(a.resolved_at)}</span>}
                    {a.source_account_number && <span>Account: {a.source_account_number}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {pagination && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{pagination.total} alert{pagination.total !== 1 ? 's' : ''}</span>
              <Pagination
                page={pagination.page}
                pages={pagination.pages}
                onPage={p => setPage(p)}
              />
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};

export default MyAlerts;
