/**
 * AlertDetail — slide-out drawer showing full alert detail.
 * Status transitions, assign analyst, freeze account, notes, SHAP chart.
 */
import React, { useState, useEffect } from 'react';
import {
  X, UserCheck, Snowflake, ChevronRight,
  AlertTriangle, CheckCircle2, XCircle, Loader2, BarChart2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { fraudService }  from '@/services/fraudService';
import { useAuth }       from '@/context/AuthContext';
import { RiskBadge }     from '@/components/fraud/RiskBadge';
import ShapChart         from '@/components/fraud/ShapChart';
import { StatusBadge }   from '@/components/ui/StatusBadge';
import { Button }        from '@/components/ui/button';
import { Input }         from '@/components/ui/input';
import { InlineLoader }  from '@/components/ui/LoadingOverlay';
import AlertNotesPanel   from './AlertNotesPanel';
import { cn }            from '@/utils/cn';

const MANAGE_ROLES = ['super_admin', 'fraud_analyst', 'branch_manager'];
const fmtDate = (s) => s ? new Date(s).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' }) : '—';
const fmtAmt  = (n,c='INR') => new Intl.NumberFormat('en-IN',{style:'currency',currency:c,maximumFractionDigits:2}).format(n??0);

// ── Status transition table ───────────────────────────────────────────────────
const NEXT_STATUSES = {
  open          : [{ status:'investigating', label:'Start Review', variant:'default',     Icon:AlertTriangle }],
  investigating : [
    { status:'escalated',       label:'Escalate',         variant:'outline',     Icon:ChevronRight },
    { status:'confirmed_fraud', label:'Confirm Fraud',    variant:'destructive', Icon:XCircle },
    { status:'false_positive',  label:'False Positive',   variant:'outline',     Icon:CheckCircle2 },
  ],
  escalated     : [
    { status:'confirmed_fraud', label:'Confirm Fraud',    variant:'destructive', Icon:XCircle },
    { status:'false_positive',  label:'False Positive',   variant:'outline',     Icon:CheckCircle2 },
  ],
  confirmed_fraud: [{ status:'resolved', label:'Resolve', variant:'outline', Icon:CheckCircle2 }],
  false_positive : [{ status:'resolved', label:'Resolve', variant:'outline', Icon:CheckCircle2 }],
  resolved       : [{ status:'closed',   label:'Close',   variant:'outline', Icon:XCircle }],
  closed         : [],
};

// ── AlertDetail ───────────────────────────────────────────────────────────────
const AlertDetail = ({ alertId, onClose, onRefresh }) => {
  const { hasRole }  = useAuth();
  const canManage    = hasRole(MANAGE_ROLES);

  const [alert,     setAlert]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState('detail');
  const [analystId, setAnalystId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [freezing,  setFreezing]  = useState(false);
  const [actioning, setActioning] = useState('');

  useEffect(() => {
    if (!alertId) return;
    setLoading(true);
    fraudService.getAlert(alertId)
      .then(r => { setAlert(r.data?.alert ?? r.alert ?? null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [alertId]);

  useEffect(() => {
    if (!alertId) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [alertId, onClose]);

  // ── Extract SHAP values from alert.prediction_explanation ──────────────────
  const shapValues = (() => {
    const expl = alert?.prediction_explanation;
    if (!expl) return null;
    const parsed = typeof expl === 'string' ? (() => { try { return JSON.parse(expl); } catch { return null; } })() : expl;
    return parsed?.shap_values ?? null;
  })();

  const transition = async (status) => {
    setActioning(status);
    try {
      await fraudService.transitionAlert(alertId, status);
      toast.success(`Alert → ${status.replace(/_/g,' ')}`);
      const res = await fraudService.getAlert(alertId);
      setAlert(res.data?.alert ?? res.alert ?? null);
      onRefresh?.();
    } catch (e) { toast.error(e?.response?.data?.error ?? 'Failed.'); }
    finally { setActioning(''); }
  };

  const assign = async () => {
    if (!analystId.trim()) return;
    setAssigning(true);
    try {
      await fraudService.assignAlert(alertId, analystId.trim());
      toast.success('Alert assigned.');
      setAnalystId('');
      const res = await fraudService.getAlert(alertId);
      setAlert(res.data?.alert ?? res.alert ?? null);
      onRefresh?.();
    } catch (e) { toast.error(e?.response?.data?.error ?? 'Failed.'); }
    finally { setAssigning(false); }
  };

  const freeze = async () => {
    setFreezing(true);
    try {
      await fraudService.freezeAccount(alertId);
      toast.success('Account frozen.');
      onRefresh?.();
    } catch (e) { toast.error(e?.response?.data?.error ?? 'Failed.'); }
    finally { setFreezing(false); }
  };

  // tabs: detail | explain | notes
  const TABS = [
    { id: 'detail',  label: 'Detail'  },
    { id: 'explain', label: 'Why Flagged', badge: shapValues?.length ? shapValues.length : null },
    { id: 'notes',   label: 'Notes'   },
  ];

  return (
    <>
      {alertId && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      )}
      <aside className={cn(
        'fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l bg-white shadow-2xl transition-transform duration-300',
        'border-gray-200 dark:border-gray-800 dark:bg-gray-900',
        alertId ? 'translate-x-0' : 'translate-x-full'
      )}>
        {alertId && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Fraud Alert</p>
                <p className="mt-0.5 font-mono text-xs text-gray-400">{alertId.slice(0,8)}…</p>
              </div>
              <div className="flex items-center gap-2">
                {alert && <RiskBadge score={alert.risk_score} />}
                {alert && <StatusBadge value={alert.status} />}
                <button onClick={onClose}
                  className="ml-1 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {loading ? <div className="p-6"><InlineLoader /></div> : !alert ? null : (
              <>
                {/* Tabs */}
                <div className="flex border-b border-gray-100 dark:border-gray-800">
                  {TABS.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                      className={`relative px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                        tab === t.id
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                      }`}>
                      {t.label}
                      {t.badge && (
                        <span className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                          {t.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4">

                  {/* ── Detail tab ─────────────────────────────────────────── */}
                  {tab === 'detail' && (
                    <div className="space-y-5">
                      {/* Transaction info */}
                      <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50 space-y-2 text-sm">
                        {[
                          ['Transaction', alert.transaction_ref],
                          ['Amount',      fmtAmt(alert.amount, alert.currency)],
                          ['Type',        alert.txn_type],
                          ['Channel',     alert.channel],
                          ['Source Acct', alert.source_account_number],
                          ['Severity',    <StatusBadge value={alert.severity} />],
                          ['Created',     fmtDate(alert.created_at)],
                          ['Assigned to', alert.analyst_email ?? '—'],
                          ['First Review',fmtDate(alert.first_reviewed_at)],
                          ['Resolved',    fmtDate(alert.resolved_at)],
                        ].map(([l,v]) => v && (
                          <div key={l} className="flex gap-3">
                            <span className="w-32 shrink-0 text-xs font-medium text-gray-500">{l}</span>
                            <span className="text-xs text-gray-800 dark:text-gray-200 break-words">{v}</span>
                          </div>
                        ))}
                        {/* Trigger reasons */}
                        {alert.trigger_reasons?.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-medium text-gray-500">Triggers</p>
                            <div className="flex flex-wrap gap-1">
                              {(typeof alert.trigger_reasons === 'string'
                                ? (() => { try { return JSON.parse(alert.trigger_reasons); } catch { return []; } })()
                                : alert.trigger_reasons
                              ).map(r => (
                                <span key={r} className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700 dark:bg-red-950/30 dark:text-red-400">
                                  {r}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Status transitions */}
                      {canManage && (NEXT_STATUSES[alert.status] ?? []).length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Actions</p>
                          <div className="flex flex-wrap gap-2">
                            {(NEXT_STATUSES[alert.status] ?? []).map(({ status, label, variant, Icon }) => (
                              <Button key={status} size="sm" variant={variant}
                                disabled={!!actioning}
                                onClick={() => transition(status)}
                                className="gap-1.5">
                                {actioning === status
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Icon className="h-3.5 w-3.5" />}
                                {label}
                              </Button>
                            ))}
                            {['investigating','escalated'].includes(alert.status) && (
                              <Button size="sm" variant="outline"
                                className="gap-1.5 border-blue-300 text-blue-700"
                                disabled={freezing} onClick={freeze}>
                                {freezing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Snowflake className="h-3.5 w-3.5" />}
                                Freeze Account
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Assign analyst */}
                      {canManage && !['resolved','closed'].includes(alert.status) && (
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Assign Analyst</p>
                          <div className="flex gap-2">
                            <Input value={analystId} onChange={e => setAnalystId(e.target.value)}
                              placeholder="Analyst user UUID"
                              className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 text-xs" />
                            <Button size="sm" disabled={assigning || !analystId.trim()} onClick={assign}
                              className="gap-1.5 shrink-0">
                              {assigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                              Assign
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Explain tab — SHAP bar chart ───────────────────────── */}
                  {tab === 'explain' && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                          <BarChart2 className="h-4 w-4 text-indigo-500" />
                          Why was this flagged?
                        </h3>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          SHAP (SHapley Additive exPlanations) values show how much each input
                          feature pushed the fraud score up <span className="text-red-500">↑</span> or
                          down <span className="text-green-500">↓</span> relative to the model
                          baseline. Top 5 features by absolute impact are shown.
                        </p>
                      </div>

                      {/* Model metadata */}
                      {(alert.prediction_model_version || alert.prediction_inference_ms) && (
                        <div className="flex flex-wrap gap-3 text-[11px] text-gray-400">
                          {alert.prediction_model_version && (
                            <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono dark:border-gray-700 dark:bg-gray-800">
                              {alert.prediction_model_version}
                            </span>
                          )}
                          {alert.prediction_inference_ms && (
                            <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 dark:border-gray-700 dark:bg-gray-800">
                              Inference: {alert.prediction_inference_ms} ms
                            </span>
                          )}
                        </div>
                      )}

                      <ShapChart shapValues={shapValues} />

                      {/* Fallback: show raw rules_triggered if no SHAP */}
                      {!shapValues?.length && alert.trigger_reasons?.length > 0 && (
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Rule-based triggers (heuristic mode)
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {(typeof alert.trigger_reasons === 'string'
                              ? (() => { try { return JSON.parse(alert.trigger_reasons); } catch { return []; } })()
                              : alert.trigger_reasons
                            ).map(r => (
                              <span key={r} className="rounded bg-red-100 px-2 py-0.5 text-[11px] text-red-700 dark:bg-red-950/30 dark:text-red-400">
                                {r}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Notes tab ──────────────────────────────────────────── */}
                  {tab === 'notes' && (
                    <AlertNotesPanel alertId={alertId} />
                  )}
                </div>
              </>
            )}
          </>
        )}
      </aside>
    </>
  );
};

export default AlertDetail;
