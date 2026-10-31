/**
 * Reports.jsx — /reports
 *
 * Features:
 *   • Paginated report list with type/status filters
 *   • Request new report modal (React Hook Form + Zod)
 *   • Download ready reports (blob stream)
 *   • Delete own reports (admin can delete any)
 *   • Role-based: only roles with reports:create can request/delete
 *   • Loading / empty / error states throughout
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import {
  FileText, Download, Trash2, Plus,
  RefreshCw, AlertCircle, CheckCircle2, Clock, XCircle,
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

// ── constants ─────────────────────────────────────────────────────────────────
const REPORT_TYPES = [
  'transaction_summary',
  'fraud_report',
  'audit_report',
  'compliance_report',
  'customer_statement',
  'risk_report',
];

const REPORT_FORMATS = ['pdf', 'excel', 'csv'];

const STATUSES = ['', 'queued', 'generating', 'ready', 'failed', 'expired'];

const CREATE_ROLES = ['super_admin', 'admin', 'compliance_officer', 'fraud_analyst'];
const LIMIT = 20;

// ── status icon ───────────────────────────────────────────────────────────────
const StatusIcon = ({ status }) => {
  if (status === 'ready')     return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  if (status === 'queued')    return <Clock        className="h-3.5 w-3.5 text-yellow-500" />;
  if (status === 'generating')return <RefreshCw    className="h-3.5 w-3.5 animate-spin text-blue-500" />;
  if (status === 'failed')    return <XCircle      className="h-3.5 w-3.5 text-red-500" />;
  return                             <AlertCircle  className="h-3.5 w-3.5 text-gray-400" />;
};

// ── Zod schema ────────────────────────────────────────────────────────────────
const requestSchema = z.object({
  reportType  : z.string().min(1, 'Report type is required.'),
  format      : z.string().min(1, 'Format is required.'),
  dateFrom    : z.string().optional(),
  dateTo      : z.string().optional(),
  customerId  : z.string().optional(),
}).refine(
  d => !d.dateFrom || !d.dateTo || d.dateTo >= d.dateFrom,
  { message: 'End date must be after start date.', path: ['dateTo'] }
);

const fmtDate  = s => s ? new Date(s).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—';
const fmtBytes = b => b ? `${(b / 1024).toFixed(1)} KB` : null;

// ─────────────────────────────────────────────────────────────────────────────
const Reports = () => {
  const { hasAnyPermission } = useAuth();
  const canCreate = hasAnyPermission(['reports:create']);
  const canExport = hasAnyPermission(['reports:export']);

  const [reports,    setReports]    = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilt, setStatusFilt] = useState('');
  const [page,       setPage]       = useState(1);
  const [showModal,  setShowModal]  = useState(false);
  const [downloading,setDownloading]= useState('');
  const [deleting,   setDeleting]   = useState('');

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(requestSchema), defaultValues: { format: 'pdf' } });

  // ── load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async (pg = page) => {
    setLoading(true); setError('');
    try {
      const res = await reportService.list({
        reportType: typeFilter || undefined,
        status    : statusFilt || undefined,
        limit     : LIMIT,
        offset    : (pg - 1) * LIMIT,
        sortDir   : 'DESC',
      });
      setReports(res.data?.data ?? []);
      setPagination(res.data?.pagination ?? null);
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilt, page]);

  useEffect(() => { load(page); }, [typeFilter, statusFilt, page]); // eslint-disable-line

  // ── request report ────────────────────────────────────────────────────────
  const onRequest = async ({ reportType, format, dateFrom, dateTo, customerId }) => {
    try {
      const parameters = {};
      if (dateFrom)    parameters.dateFrom    = dateFrom;
      if (dateTo)      parameters.dateTo      = dateTo;
      if (customerId)  parameters.customerId  = customerId;

      await reportService.request(reportType, format, parameters);
      toast.success('Report queued for generation.');
      setShowModal(false);
      reset();
      load(1);
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Failed to request report.');
    }
  };

  const EXT_MAP = {
    pdf: '.pdf',
    excel: '.xlsx',
    csv: '.csv',
  };

  // ── download ──────────────────────────────────────────────────────────────
  const download = async (report) => {
    if (report.status !== 'ready') {
      toast.error('Report is not ready yet.');
      return;
    }
    setDownloading(report.id);
    try {
      const response = await reportService.download(report.id);
      const ext = EXT_MAP[report.format] || (report.format ? `.${report.format}` : '.pdf');
      const name = `${(report.title ?? 'report').replace(/[^a-z0-9_-]/gi, '_')}${ext}`;
      triggerDownload(response, name);
      toast.success(`Downloaded ${name}`);
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Download failed.');
    } finally {
      setDownloading('');
    }
  };

  // ── delete ────────────────────────────────────────────────────────────────
  const deleteReport = async (id) => {
    if (!window.confirm('Delete this report?')) return;
    setDeleting(id);
    try {
      await reportService.delete(id);
      toast.success('Report deleted.');
      load(page);
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Failed to delete report.');
    } finally {
      setDeleting('');
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <FileText className="h-6 w-6 text-blue-600" /> Reports
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Generate, download, and manage system reports.
          </p>
        </div>
        <div className="flex gap-2">
          {canCreate && (
            <Button size="sm" className="gap-1.5" onClick={() => setShowModal(true)}>
              <Plus className="h-4 w-4" /> Request Report
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <Select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} className="w-52">
          <option value="">All types</option>
          {REPORT_TYPES.map(t => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </Select>
        <Select value={statusFilt} onChange={e => { setStatusFilt(e.target.value); setPage(1); }} className="w-36">
          {STATUSES.map(s => (
            <option key={s} value={s}>{s || 'All statuses'}</option>
          ))}
        </Select>
      </div>

      <ErrorMessage message={error} />

      {/* ── Table ──────────────────────────────────────────────────────── */}
      {loading ? (
        <InlineLoader label="Loading reports…" />
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 py-16 text-gray-400 dark:border-gray-700">
          <FileText className="h-10 w-10" />
          <p className="text-sm">No reports found.</p>
          {canCreate && (
            <Button size="sm" variant="outline" onClick={() => setShowModal(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Request your first report
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900 text-left">
                  {['Report', 'Type', 'Format', 'Status', 'Requested', 'Size', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {reports.map(r => (
                  <tr key={r.id} className="bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/60">
                    <td className="px-4 py-3 max-w-[200px]">
                      <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                        {r.title ?? r.report_type?.replace(/_/g, ' ')}
                      </p>
                      <p className="text-[11px] font-mono text-gray-400">{r.id?.slice(0, 8)}…</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={r.report_type} label={r.report_type?.replace(/_/g, ' ')} />
                    </td>
                    <td className="px-4 py-3 text-xs font-mono uppercase text-gray-600 dark:text-gray-400">
                      {r.format ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                        <StatusIcon status={r.status} />
                        <StatusBadge value={r.status} />
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      <div>{fmtDate(r.created_at)}</div>
                      <div className="text-[10px] text-gray-400">{r.requester_email ?? ''}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {fmtBytes(r.file_size) ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
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
                        {canCreate && (
                          <Button
                            size="sm" variant="outline"
                            className="h-7 gap-1 text-xs text-red-600 hover:bg-red-50 hover:border-red-300 dark:hover:bg-red-950/20"
                            disabled={deleting === r.id}
                            onClick={() => deleteReport(r.id)}
                          >
                            {deleting === r.id
                              ? <RefreshCw className="h-3 w-3 animate-spin" />
                              : <Trash2 className="h-3 w-3" />}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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

      {/* ── Request Report Modal ────────────────────────────────────────── */}
      <Modal open={showModal} onClose={() => { setShowModal(false); reset(); }} title="Request New Report" size="sm">
        <form onSubmit={handleSubmit(onRequest)} className="space-y-4">
          {/* Report type */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Report Type *
            </label>
            <Select {...register('reportType')} className="w-full">
              <option value="">Select type…</option>
              {REPORT_TYPES.map(t => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </Select>
            <FieldError message={errors.reportType?.message} />
          </div>

          {/* Format */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Format *
            </label>
            <Select {...register('format')} className="w-full">
              {REPORT_FORMATS.map(f => (
                <option key={f} value={f}>{f.toUpperCase()}</option>
              ))}
            </Select>
            <FieldError message={errors.format?.message} />
          </div>

          {/* Date range */}
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

          {/* Customer ID (optional) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Customer ID <span className="font-normal text-gray-400">(optional — for customer statements)</span>
            </label>
            <Input
              {...register('customerId')}
              placeholder="UUID v4"
              className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
            <FieldError message={errors.customerId?.message} />
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
            <Button type="button" variant="outline" onClick={() => { setShowModal(false); reset(); }}
              disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              {isSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              Queue Report
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Reports;
