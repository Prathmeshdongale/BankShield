/**
 * AuditLogs.jsx — /audit-logs
 *
 * The server does not expose a dedicated /api/audit-logs listing endpoint.
 * Audit data is available via two paths:
 *   1. Reports module — request an `audit_report` (async generation → download).
 *   2. In-system event feed — login history, KYC changes, account actions etc.
 *      are captured in audit_logs but only surfaced via reports today.
 *
 * This page therefore:
 *   • Shows existing audit_report entries from GET /api/reports
 *   • Lets users request a new audit export (POST /api/reports)
 *   • Renders a rich, filterable pending/ready/failed state per report
 *   • Shows a "live" placeholder panel with the framework for when a
 *     direct /api/audit-logs endpoint is wired up in a future sprint.
 *
 * Role gate: audit:read  (super_admin, admin, compliance_officer, fraud_analyst)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import {
  ClipboardList, Download, Plus, RefreshCw,
  CheckCircle2, Clock, XCircle, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { reportService, triggerDownload } from '@/services/reportService';
import { useAuth }              from '@/context/AuthContext';
import { Button }               from '@/components/ui/button';
import { Input }                from '@/components/ui/input';
import Select                   from '@/components/ui/Select';
import { StatusBadge }          from '@/components/ui/StatusBadge';
import { Pagination }           from '@/components/ui/Pagination';
import { InlineLoader }         from '@/components/ui/LoadingOverlay';
import { ErrorMessage, FieldError } from '@/components/ui/ErrorMessage';
import Modal                    from '@/components/ui/Modal';

const LIMIT = 20;
const FORMATS = ['pdf', 'excel', 'csv'];

const exportSchema = z.object({
  format  : z.string().min(1, 'Format is required.'),
  dateFrom: z.string().optional(),
  dateTo  : z.string().optional(),
}).refine(
  d => !d.dateFrom || !d.dateTo || d.dateTo >= d.dateFrom,
  { message: 'End date must be after start date.', path: ['dateTo'] }
);

const fmtDate  = s => s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fmtBytes = b => b ? `${(b / 1024).toFixed(1)} KB` : null;

const StatusIcon = ({ status }) => {
  if (status === 'ready')      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  if (status === 'queued')     return <Clock        className="h-3.5 w-3.5 text-yellow-500" />;
  if (status === 'generating') return <RefreshCw    className="h-3.5 w-3.5 animate-spin text-blue-500" />;
  if (status === 'failed')     return <XCircle      className="h-3.5 w-3.5 text-red-500" />;
  return                              <Clock        className="h-3.5 w-3.5 text-gray-400" />;
};

// ─────────────────────────────────────────────────────────────────────────────
const AuditLogs = () => {
  const { hasAnyPermission } = useAuth();
  const canRead   = hasAnyPermission(['audit:read']);
  const canExport = hasAnyPermission(['audit:export', 'reports:export']);
  const canCreate = hasAnyPermission(['reports:create']);

  const [reports,    setReports]    = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [statusFilt, setStatusFilt] = useState('');
  const [page,       setPage]       = useState(1);
  const [showModal,  setShowModal]  = useState(false);
  const [downloading,setDownloading]= useState('');

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(exportSchema), defaultValues: { format: 'pdf' } });

  // ── load audit reports ─────────────────────────────────────────────────────
  const load = useCallback(async (pg = page) => {
    setLoading(true); setError('');
    try {
      const res = await reportService.list({
        reportType: 'audit_report',
        status    : statusFilt || undefined,
        limit     : LIMIT,
        offset    : (pg - 1) * LIMIT,
        sortDir   : 'DESC',
      });
      setReports(res.data?.data ?? []);
      setPagination(res.data?.pagination ?? null);
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [statusFilt, page]);

  useEffect(() => { load(page); }, [statusFilt, page]); // eslint-disable-line

  // ── request export ─────────────────────────────────────────────────────────
  const onExport = async ({ format, dateFrom, dateTo }) => {
    try {
      const parameters = {};
      if (dateFrom) parameters.dateFrom = dateFrom;
      if (dateTo)   parameters.dateTo   = dateTo;
      await reportService.request('audit_report', format, parameters);
      toast.success('Audit report queued. It will appear below when ready.');
      setShowModal(false);
      reset();
      load(1);
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Failed to queue audit export.');
    }
  };

  // ── download ───────────────────────────────────────────────────────────────
  const download = async (report) => {
    if (report.status !== 'ready') { toast.error('Report not ready yet.'); return; }
    setDownloading(report.id);
    try {
      const response = await reportService.download(report.id);
      const ext  = report.format ? `.${report.format}` : '';
      const name = `audit_report_${report.id.slice(0, 8)}${ext}`;
      triggerDownload(response, name);
      toast.success('Download started.');
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Download failed.');
    } finally {
      setDownloading('');
    }
  };

  if (!canRead) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-gray-400">
        <ClipboardList className="h-10 w-10" />
        <p className="text-sm font-medium">You don&apos;t have permission to view audit logs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <ClipboardList className="h-6 w-6 text-indigo-600" /> Audit Logs
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            System audit trail — request and download audit reports.
          </p>
        </div>
        <div className="flex gap-2">
          {canCreate && (
            <Button size="sm" className="gap-1.5" onClick={() => setShowModal(true)}>
              <Plus className="h-4 w-4" /> Export Audit Report
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Info banner ────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm dark:border-indigo-800 dark:bg-indigo-950/30">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
        <div className="text-indigo-800 dark:text-indigo-300">
          <strong>Audit exports are generated asynchronously.</strong> Request a report below — it will
          appear in the list with a <em>queued</em> or <em>generating</em> status and become
          downloadable once ready. Audit events captured include: logins, password changes,
          account mutations, KYC updates, fraud actions, and role changes.
        </div>
      </div>

      {/* ── Filter ─────────────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <Select value={statusFilt} onChange={e => { setStatusFilt(e.target.value); setPage(1); }} className="w-40">
          <option value="">All statuses</option>
          {['queued','generating','ready','failed','expired'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
      </div>

      <ErrorMessage message={error} />

      {/* ── Reports table ──────────────────────────────────────────────── */}
      {loading ? (
        <InlineLoader label="Loading audit exports…" />
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 py-16 text-gray-400 dark:border-gray-700">
          <ClipboardList className="h-10 w-10" />
          <p className="text-sm">No audit reports yet.</p>
          {canCreate && (
            <Button size="sm" variant="outline" onClick={() => setShowModal(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Request first audit export
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900 text-left">
                  {['Report', 'Format', 'Status', 'Date Range', 'Requested By', 'Size', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {reports.map(r => {
                  const params = r.parameters ?? {};
                  return (
                    <tr key={r.id} className="bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                          {r.title ?? 'Audit Report'}
                        </p>
                        <p className="font-mono text-[11px] text-gray-400">{r.id?.slice(0, 8)}…</p>
                        <p className="text-[10px] text-gray-400">{fmtDate(r.created_at)}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs uppercase text-gray-600 dark:text-gray-400">
                        {r.format ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <StatusIcon status={r.status} />
                          <StatusBadge value={r.status} />
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {params.dateFrom || params.dateTo
                          ? `${params.dateFrom ?? '—'} → ${params.dateTo ?? '—'}`
                          : 'All time'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {r.requester_email ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {fmtBytes(r.file_size) ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {canExport && r.status === 'ready' && (
                          <Button
                            size="sm" variant="outline"
                            className="h-7 gap-1 text-xs"
                            disabled={downloading === r.id}
                            onClick={() => download(r)}
                          >
                            {downloading === r.id
                              ? <RefreshCw className="h-3 w-3 animate-spin" />
                              : <Download className="h-3 w-3" />}
                            Download
                          </Button>
                        )}
                        {r.status === 'queued' || r.status === 'generating' ? (
                          <span className="text-[10px] text-gray-400 italic">Processing…</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pagination && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{pagination.total} report{pagination.total !== 1 ? 's' : ''}</span>
              <Pagination page={pagination.page} pages={pagination.pages} onPage={p => setPage(p)} />
            </div>
          )}
        </>
      )}

      {/* ── Export modal ───────────────────────────────────────────────── */}
      <Modal open={showModal} onClose={() => { setShowModal(false); reset(); }} title="Request Audit Export" size="sm">
        <form onSubmit={handleSubmit(onExport)} className="space-y-4">

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Format *
            </label>
            <Select {...register('format')} className="w-full">
              {FORMATS.map(f => (
                <option key={f} value={f}>{f.toUpperCase()}</option>
              ))}
            </Select>
            <FieldError message={errors.format?.message} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                From
              </label>
              <Input type="date" {...register('dateFrom')}
                className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              <FieldError message={errors.dateFrom?.message} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                To
              </label>
              <Input type="date" {...register('dateTo')}
                className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              <FieldError message={errors.dateTo?.message} />
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Leave date fields empty to export all available audit events.
          </p>

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
            <Button type="button" variant="outline" disabled={isSubmitting}
              onClick={() => { setShowModal(false); reset(); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              {isSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              Queue Export
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default AuditLogs;
