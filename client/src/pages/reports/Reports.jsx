/**
 * Reports.jsx — /reports & /branch/reports
 *
 * Features:
 *   • Paginated report list with type/status filters
 *   • Quick format dropdown: PDF, CSV, Excel
 *   • Full custom request modal (Type, Format, Date Range, Customer ID)
 *   • Auto-polling while reports are queued or generating
 *   • Formatted Download button with matching file extensions (.pdf, .csv, .xlsx)
 *   • Delete reports with role permissions
 *   • High-visibility format badges and progress indicators
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import {
  FileText, Download, Trash2, Plus, ChevronDown,
  RefreshCw, AlertCircle, CheckCircle2, Clock, XCircle,
  FileSpreadsheet, Table, Sparkles
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
import { cn }                   from '@/utils/cn';

// ── constants ─────────────────────────────────────────────────────────────────
const REPORT_TYPES = [
  'transaction_summary',
  'fraud_report',
  'audit_report',
  'compliance_report',
  'customer_statement',
  'risk_report',
];

const REPORT_FORMATS = ['pdf', 'csv', 'excel'];

const STATUSES = ['', 'queued', 'generating', 'ready', 'failed', 'expired'];

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

const EXT_MAP = {
  pdf: '.pdf',
  excel: '.xlsx',
  csv: '.csv',
};

// ─────────────────────────────────────────────────────────────────────────────
const Reports = () => {
  const { hasAnyPermission } = useAuth();
  const canCreate = hasAnyPermission(['reports:create']);
  const canExport = hasAnyPermission(['reports:export', 'reports:create']);

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
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(requestSchema), defaultValues: { format: 'pdf' } });

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setExportDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // ── Auto-poll when reports are queued or generating ──────────────────────
  useEffect(() => {
    const hasPending = reports.some(r => r.status === 'queued' || r.status === 'generating');
    if (!hasPending) return;

    const interval = setInterval(() => {
      load(page);
    }, 3000);

    return () => clearInterval(interval);
  }, [reports, load, page]);

  // ── request report ────────────────────────────────────────────────────────
  const onRequest = async ({ reportType, format, dateFrom, dateTo, customerId }) => {
    try {
      const parameters = {};
      if (dateFrom)    parameters.dateFrom    = dateFrom;
      if (dateTo)      parameters.dateTo      = dateTo;
      if (customerId)  parameters.customerId  = customerId;

      await reportService.request(reportType, format, parameters);
      toast.success(`Report queued as ${format.toUpperCase()}.`);
      setShowModal(false);
      reset();
      load(1);
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Failed to request report.');
    }
  };

  // ── quick request ─────────────────────────────────────────────────────────
  const handleQuickRequest = async (type, format) => {
    setExportDropdownOpen(false);
    try {
      await reportService.request(type, format, {});
      toast.success(`Queued ${type.replace(/_/g, ' ')} as ${format.toUpperCase()}.`);
      load(1);
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Failed to queue report.');
    }
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
      let errorMsg = 'Download failed.';
      if (e?.response?.data instanceof Blob) {
        try {
          const text = await e.response.data.text();
          const json = JSON.parse(text);
          errorMsg = json.error || errorMsg;
        } catch {
          // keep fallback
        }
      } else if (e?.response?.data?.error) {
        errorMsg = e.response.data.error;
      }
      toast.error(errorMsg);
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
            <FileText className="h-6 w-6 text-blue-600" /> Reports & Analytics
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Generate, customize, and download operational and fraud reports in PDF, CSV, or Excel formats.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canCreate && (
            <div className="relative" ref={dropdownRef}>
              <div className="inline-flex rounded-lg shadow-sm">
                <Button
                  size="sm"
                  className="gap-1.5 rounded-r-none border-r border-blue-500"
                  onClick={() => setShowModal(true)}
                >
                  <Plus className="h-4 w-4" /> Request Report
                </Button>
                <Button
                  size="sm"
                  className="px-2 rounded-l-none"
                  onClick={() => setExportDropdownOpen(prev => !prev)}
                  title="Quick format options"
                  aria-label="Quick format options"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </div>

              {exportDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-xl z-30 dark:border-gray-700 dark:bg-gray-800 animate-in fade-in zoom-in-95">
                  <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Quick Generate by Format
                  </div>

                  <button
                    type="button"
                    onClick={() => handleQuickRequest('transaction_summary', 'pdf')}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left text-xs rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 transition"
                  >
                    <div className="p-1 rounded bg-red-100 dark:bg-red-950/60 text-red-600">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">Transaction Summary (PDF)</div>
                      <div className="text-[11px] text-gray-500">Print-ready document layout</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickRequest('transaction_summary', 'csv')}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left text-xs rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 transition"
                  >
                    <div className="p-1 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600">
                      <Table className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">Transaction Summary (CSV)</div>
                      <div className="text-[11px] text-gray-500">Forensic tabular data export</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickRequest('fraud_report', 'excel')}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left text-xs rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 transition"
                  >
                    <div className="p-1 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-600">
                      <FileSpreadsheet className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">Fraud Summary (Excel)</div>
                      <div className="text-[11px] text-gray-500">Auto-filtered spreadsheet workbook</div>
                    </div>
                  </button>

                  <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

                  <button
                    type="button"
                    onClick={() => { setExportDropdownOpen(false); setShowModal(true); }}
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40 transition"
                  >
                    <Plus className="h-3.5 w-3.5" /> Custom Filters & All Types…
                  </button>
                </div>
              )}
            </div>
          )}

          <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <Select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} className="w-52">
          <option value="">All report types</option>
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
          <FileText className="h-10 w-10 text-gray-400" />
          <p className="text-sm">No reports generated yet.</p>
          {canCreate && (
            <Button size="sm" variant="outline" onClick={() => setShowModal(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Request your first report
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900 text-left">
                  {['Report Title', 'Type', 'Format', 'Status', 'Requested By', 'Size', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {reports.map(r => {
                  const format = (r.format || r.parameters?.format || 'pdf').toLowerCase();
                  return (
                    <tr key={r.id} className="bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/60 transition-colors">
                      <td className="px-4 py-3 max-w-[220px]">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                          {r.title ?? r.report_type?.replace(/_/g, ' ')}
                        </p>
                        <p className="text-[11px] font-mono text-gray-400">{r.id?.slice(0, 8)}…</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={r.report_type} label={r.report_type?.replace(/_/g, ' ')} />
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider',
                          format === 'csv'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                            : format === 'excel'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                        )}>
                          {format === 'csv' && <Table className="h-3 w-3" />}
                          {format === 'excel' && <FileSpreadsheet className="h-3 w-3" />}
                          {format === 'pdf' && <FileText className="h-3 w-3" />}
                          {format.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                          <StatusIcon status={r.status} />
                          <StatusBadge value={r.status} />
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        <div className="font-medium text-gray-700 dark:text-gray-300">{fmtDate(r.created_at)}</div>
                        <div className="text-[11px] text-gray-400">{r.requester_email ?? ''}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                        {fmtBytes(r.file_size) ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {canExport && r.status === 'ready' && (
                            <Button
                              size="sm"
                              className="h-8 gap-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                              disabled={downloading === r.id}
                              onClick={() => download(r)}
                            >
                              {downloading === r.id ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                              Download
                            </Button>
                          )}

                          {(r.status === 'queued' || r.status === 'generating') && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium animate-pulse px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/40">
                              <RefreshCw className="h-3 w-3 animate-spin" /> Generating…
                            </span>
                          )}

                          {r.status === 'failed' && (
                            <span className="text-xs text-red-500 font-medium" title={r.error_message || 'Report failed'}>
                              Failed
                            </span>
                          )}

                          {canCreate && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:border-red-300 dark:hover:bg-red-950/20"
                              disabled={deleting === r.id}
                              onClick={() => deleteReport(r.id)}
                              title="Delete report"
                            >
                              {deleting === r.id ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}
                        </div>
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

      {/* ── Request Report Modal ────────────────────────────────────────── */}
      <Modal open={showModal} onClose={() => { setShowModal(false); reset(); }} title="Request New Report" size="sm">
        <form onSubmit={handleSubmit(onRequest)} className="space-y-4">
          {/* Report type */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Report Type *
            </label>
            <Select {...register('reportType')} className="w-full">
              <option value="">Select report type…</option>
              {REPORT_TYPES.map(t => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </Select>
            <FieldError message={errors.reportType?.message} />
          </div>

          {/* Format selection */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Download Format *
            </label>
            <Select {...register('format')} className="w-full">
              <option value="pdf">PDF Document (.pdf) — Executive print-ready summary</option>
              <option value="csv">CSV Spreadsheet (.csv) — Forensic raw data export</option>
              <option value="excel">Excel Workbook (.xlsx) — Formatted & auto-filtered table</option>
            </Select>
            <p className="mt-1 text-[11px] text-gray-500">
              Select between PDF for formal reports or CSV/Excel for data manipulation and analysis.
            </p>
            <FieldError message={errors.format?.message} />
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                From Date
              </label>
              <Input
                type="date"
                {...register('dateFrom')}
                className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
              <FieldError message={errors.dateFrom?.message} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                To Date
              </label>
              <Input
                type="date"
                {...register('dateTo')}
                className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
              <FieldError message={errors.dateTo?.message} />
            </div>
          </div>

          {/* Customer ID (optional) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Customer ID <span className="font-normal text-gray-400">(optional — for customer activity statement)</span>
            </label>
            <Input
              {...register('customerId')}
              placeholder="UUID v4 (leave empty for all)"
              className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
            <FieldError message={errors.customerId?.message} />
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setShowModal(false); reset(); }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
              {isSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              Generate Report
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Reports;
