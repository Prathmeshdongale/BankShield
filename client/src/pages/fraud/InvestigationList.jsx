/**
 * InvestigationList — /fraud/investigations
 * Paginated case list with open-investigation workflow.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileSearch, Plus, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { fraudService }       from '@/services/fraudService';
import { useAuth }             from '@/context/AuthContext';
import { StatusBadge }         from '@/components/ui/StatusBadge';
import { Button }              from '@/components/ui/button';
import { Input }               from '@/components/ui/input';
import Select                  from '@/components/ui/Select';
import { Pagination }          from '@/components/ui/Pagination';
import { InlineLoader }        from '@/components/ui/LoadingOverlay';
import { ErrorMessage }        from '@/components/ui/ErrorMessage';
import Modal                   from '@/components/ui/Modal';
import { FieldError }          from '@/components/ui/ErrorMessage';
import InvestigationDetail     from './InvestigationDetail';

const MANAGE_ROLES = ['super_admin','admin','compliance_officer','fraud_analyst'];
const INV_STATUSES = ['','open','in_progress','pending_review','closed_fraud','closed_no_fraud'];
const PRIORITIES   = ['','low','medium','high','critical'];
const LIMIT = 20;

const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN') : '—';
const priorityColor = { critical:'text-red-600', high:'text-orange-500', medium:'text-yellow-600', low:'text-green-600' };

const InvestigationList = () => {
  const { hasRole }  = useAuth();
  const canManage    = hasRole(MANAGE_ROLES);
  const [sp, setSp]  = useSearchParams();
  const [invs,       setInvs]       = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [status,     setStatus]     = useState(sp.get('status')   ?? '');
  const [priority,   setPriority]   = useState(sp.get('priority') ?? '');
  const [page,       setPage]       = useState(parseInt(sp.get('page') ?? '1', 10));
  const [selectedId, setSelectedId] = useState(null);
  const [openModal,  setOpenModal]  = useState(false);
  const [alertId,    setAlertId]    = useState('');
  const [invPriority,setInvPriority]= useState('medium');
  const [opening,    setOpening]    = useState(false);

  const load = useCallback(async (pg = page) => {
    setLoading(true); setError('');
    try {
      const res = await fraudService.listInvestigations({
        status: status || undefined, priority: priority || undefined,
        limit: LIMIT, offset: (pg-1)*LIMIT,
      });
      setInvs(res.data?.data ?? []);
      setPagination(res.data?.pagination ?? null);
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to load investigations.');
    } finally { setLoading(false); }
  }, [status, priority, page]);

  useEffect(() => { load(page); }, [status, priority, page]); // eslint-disable-line

  const changePage = p => {
    setPage(p);
    setSp({ status, priority, page: String(p) }, { replace: true });
  };

  const handleOpen = async () => {
    if (!alertId.trim()) return;
    setOpening(true);
    try {
      await fraudService.openInvestigation(alertId.trim(), { priority: invPriority });
      toast.success('Investigation opened.');
      setOpenModal(false); setAlertId('');
      load(1);
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Failed to open investigation.');
    } finally { setOpening(false); }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <FileSearch className="h-6 w-6 text-blue-600" /> Fraud Investigations
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Formal case management for confirmed and suspected fraud.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/fraud/alerts">
            <Button variant="outline" size="sm">Alert Queue</Button>
          </Link>
          {canManage && (
            <Button size="sm" className="gap-1.5" onClick={() => setOpenModal(true)}>
              <Plus className="h-4 w-4" /> Open Case
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading}
            className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading?'animate-spin':''}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-44">
          {INV_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')||'All statuses'}</option>)}
        </Select>
        <Select value={priority} onChange={e => { setPriority(e.target.value); setPage(1); }} className="w-36">
          {PRIORITIES.map(p => <option key={p} value={p}>{p||'All priorities'}</option>)}
        </Select>
      </div>

      <ErrorMessage message={error} />

      {loading ? <InlineLoader label="Loading investigations…" /> : (
        <>
          {invs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
              <FileSearch className="h-10 w-10" />
              <p className="text-sm">No investigations found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900 text-left">
                    {['Case #','Status','Priority','Opened By','Assigned','Opened','Closed',''].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {invs.map(inv => (
                    <tr key={inv.id} onClick={() => setSelectedId(inv.id)}
                      className="cursor-pointer bg-white hover:bg-blue-50/40 dark:bg-gray-900 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">
                        {inv.case_number}
                      </td>
                      <td className="px-4 py-3"><StatusBadge value={inv.status} /></td>
                      <td className={`px-4 py-3 text-xs font-bold capitalize ${priorityColor[inv.priority]??''}`}>
                        {inv.priority}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">
                        {inv.opener_first_name} {inv.opener_last_name}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{inv.assignee_email ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(inv.opened_at)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(inv.closed_at)}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <Button size="sm" variant="outline"
                          onClick={() => setSelectedId(inv.id)}>View</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{pagination.total} case{pagination.total!==1?'s':''}</span>
              <Pagination page={pagination.page} pages={pagination.pages} onPage={changePage} />
            </div>
          )}
        </>
      )}

      {/* Open investigation modal */}
      <Modal open={openModal} onClose={() => setOpenModal(false)} title="Open Investigation" size="sm">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Alert ID *</label>
            <Input value={alertId} onChange={e => setAlertId(e.target.value)}
              placeholder="UUID of the fraud alert"
              className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Priority</label>
            <Select value={invPriority} onChange={e => setInvPriority(e.target.value)} className="w-full">
              {['low','medium','high','critical'].map(p => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpenModal(false)} disabled={opening}>Cancel</Button>
            <Button onClick={handleOpen} disabled={opening || !alertId.trim()} className="gap-2">
              {opening && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              Open Case
            </Button>
          </div>
        </div>
      </Modal>

      {/* Detail drawer */}
      <InvestigationDetail
        invId={selectedId}
        onClose={() => setSelectedId(null)}
        onRefresh={() => load(page)}
      />
    </div>
  );
};

export default InvestigationList;
