/**
 * InvestigationDetail — drawer for a single fraud investigation.
 * Status machine: open → in_progress → pending_review → closed_fraud / closed_no_fraud
 */
import React, { useState, useEffect } from 'react';
import { X, ChevronRight, XCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import toast from 'react-hot-toast';
import { fraudService }   from '@/services/fraudService';
import { useAuth }        from '@/context/AuthContext';
import { StatusBadge }    from '@/components/ui/StatusBadge';
import { Button }         from '@/components/ui/button';
import { InlineLoader }   from '@/components/ui/LoadingOverlay';
import { FieldError }     from '@/components/ui/ErrorMessage';
import AlertNotesPanel    from './AlertNotesPanel';
import { cn }             from '@/utils/cn';

const MANAGE_ROLES = ['super_admin','admin','compliance_officer','fraud_analyst'];
const fmtDate = (s) => s ? new Date(s).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}) : '—';

const NEXT = {
  open          : [{ status:'in_progress',    label:'Start',          variant:'default' }],
  in_progress   : [{ status:'pending_review', label:'Request Review', variant:'outline' }],
  pending_review: [
    { status:'closed_fraud',    label:'Confirm Fraud',    variant:'destructive' },
    { status:'closed_no_fraud', label:'No Fraud Found',   variant:'outline' },
  ],
  closed_fraud    : [],
  closed_no_fraud : [],
};

const closeSchema = z.object({
  outcome: z.string().min(10,'Outcome must be at least 10 characters.'),
});

const InvestigationDetail = ({ invId, onClose, onRefresh }) => {
  const { hasRole }  = useAuth();
  const canManage    = hasRole(MANAGE_ROLES);
  const [inv,        setInv]       = useState(null);
  const [loading,    setLoading]   = useState(false);
  const [tab,        setTab]       = useState('detail');
  const [actioning,  setActioning] = useState('');
  const [showClose,  setShowClose] = useState(false);
  const [closeStatus,setCloseStatus] = useState('');

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(closeSchema) });

  const load = async () => {
    if (!invId) return;
    setLoading(true);
    try {
      const r = await fraudService.getInvestigation(invId);
      setInv(r.data?.investigation ?? null);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [invId]); // eslint-disable-line

  useEffect(() => {
    if (!invId) return;
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [invId, onClose]);

  const transition = async (status) => {
    if (status === 'closed_fraud' || status === 'closed_no_fraud') {
      setCloseStatus(status); setShowClose(true); return;
    }
    setActioning(status);
    try {
      await fraudService.updateInvestigation(invId, { status });
      toast.success(`Investigation → ${status.replace(/_/g,' ')}`);
      await load(); onRefresh?.();
    } catch (e) { toast.error(e?.response?.data?.error ?? 'Failed.'); }
    finally { setActioning(''); }
  };

  const submitClose = async ({ outcome }) => {
    try {
      await fraudService.updateInvestigation(invId, { status: closeStatus, outcome });
      toast.success(`Investigation closed: ${closeStatus.replace(/_/g,' ')}`);
      setShowClose(false); reset();
      await load(); onRefresh?.();
    } catch (e) { toast.error(e?.response?.data?.error ?? 'Failed.'); }
  };

  return (
    <>
      {invId && <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />}
      <aside className={cn(
        'fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l bg-white shadow-2xl transition-transform duration-300',
        'border-gray-200 dark:border-gray-800 dark:bg-gray-900',
        invId ? 'translate-x-0' : 'translate-x-full'
      )}>
        {invId && (
          <>
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Investigation</p>
                <p className="font-mono text-xs font-bold text-gray-700 dark:text-gray-300">
                  {inv?.case_number ?? '…'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {inv && <StatusBadge value={inv.status} />}
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                  inv?.priority === 'critical' ? 'bg-red-100 text-red-700' :
                  inv?.priority === 'high'     ? 'bg-orange-100 text-orange-700' :
                  inv?.priority === 'medium'   ? 'bg-yellow-100 text-yellow-700' :
                                                  'bg-gray-100 text-gray-600'
                }`}>{inv?.priority}</span>
                <button onClick={onClose}
                  className="ml-1 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {loading ? <div className="p-6"><InlineLoader /></div> : !inv ? null : (
              <>
                <div className="flex border-b border-gray-100 dark:border-gray-800">
                  {['detail','notes'].map(t => (
                    <button key={t} onClick={() => setTab(t)}
                      className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                        tab===t?'border-blue-600 text-blue-600':'border-transparent text-gray-500 hover:text-gray-700'
                      }`}>{t}</button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {tab === 'detail' && (
                    <div className="space-y-5">
                      <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50 space-y-2 text-sm">
                        {[
                          ['Case #',     inv.case_number],
                          ['Status',     <StatusBadge value={inv.status} />],
                          ['Priority',   inv.priority],
                          ['Opened by',  `${inv.opener_first_name} ${inv.opener_last_name}`],
                          ['Assigned to',inv.assignee_email ?? '—'],
                          ['Opened',     fmtDate(inv.opened_at)],
                          ['Closed',     fmtDate(inv.closed_at)],
                          ['Outcome',    inv.outcome],
                        ].map(([l,v]) => v && (
                          <div key={l} className="flex gap-3">
                            <span className="w-28 shrink-0 text-xs font-medium text-gray-500">{l}</span>
                            <span className="text-xs text-gray-800 dark:text-gray-200">{v}</span>
                          </div>
                        ))}
                      </div>

                      {/* Status transitions */}
                      {canManage && (NEXT[inv.status]??[]).length > 0 && !showClose && (
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Actions</p>
                          <div className="flex flex-wrap gap-2">
                            {(NEXT[inv.status]??[]).map(({ status, label, variant }) => (
                              <Button key={status} size="sm" variant={variant}
                                disabled={!!actioning} onClick={() => transition(status)}
                                className="gap-1.5">
                                {actioning===status && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                {label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Close form */}
                      {showClose && (
                        <div className={cn(
                          'rounded-xl border p-4 space-y-3',
                          closeStatus==='closed_fraud'
                            ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20'
                            : 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20'
                        )}>
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                            {closeStatus==='closed_fraud' ? '⚠ Confirm Fraud' : '✓ No Fraud Found'}
                          </p>
                          <form onSubmit={handleSubmit(submitClose)} className="space-y-3">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-600">Outcome *</label>
                              <textarea rows={3} {...register('outcome')}
                                placeholder="Describe the investigation outcome and evidence…"
                                className="w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                              <FieldError message={errors.outcome?.message} />
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" variant="outline" size="sm"
                                onClick={() => { setShowClose(false); reset(); }}>Cancel</Button>
                              <Button type="submit" size="sm" disabled={isSubmitting}
                                variant={closeStatus==='closed_fraud' ? 'destructive' : 'default'}
                                className="gap-1.5">
                                {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Close Investigation
                              </Button>
                            </div>
                          </form>
                        </div>
                      )}
                    </div>
                  )}
                  {tab === 'notes' && <AlertNotesPanel investigationId={invId} />}
                </div>
              </>
            )}
          </>
        )}
      </aside>
    </>
  );
};

export default InvestigationDetail;
