/**
 * KycSection — list KYC documents + upload form + approve/reject controls.
 * Rendered inside CustomerDetail.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useForm }      from 'react-hook-form';
import { zodResolver }  from '@hookform/resolvers/zod';
import { z }            from 'zod';
import {
  Upload, CheckCircle2, XCircle, FileText,
  RefreshCw, Loader2, AlertCircle,
} from 'lucide-react';
import toast               from 'react-hot-toast';
import { customerService } from '@/services/customerService';
import { StatusBadge }     from '@/components/ui/StatusBadge';
import { Button }          from '@/components/ui/button';
import Select              from '@/components/ui/Select';
import { Input }           from '@/components/ui/input';
import { FieldError }      from '@/components/ui/ErrorMessage';
import { InlineLoader }    from '@/components/ui/LoadingOverlay';
import { useAuth }         from '@/context/AuthContext';

const VERIFY_ROLES = ['super_admin','admin','compliance_officer','branch_manager'];

const DOC_TYPES = [
  'passport','national_id','driving_licence','voter_id',
  'aadhaar','pan','utility_bill','other',
];

const ACCEPTED = '.jpg,.jpeg,.png,.webp,.pdf';
const MAX_MB   = 5;

// ── Upload form schema ────────────────────────────────────────────────────────
const uploadSchema = z.object({
  docType   : z.string().min(1,'Document type is required.'),
  docNumber : z.string().max(100).optional(),
  expiryDate: z.string().optional(),
});

// ── KycSection ────────────────────────────────────────────────────────────────
export const KycSection = ({ customerId }) => {
  const { hasRole }  = useAuth();
  const canVerify    = hasRole(VERIFY_ROLES);

  const [docs,      setDocs]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState('');
  const fileRef = useRef(null);

  const { register, handleSubmit, reset, formState: { errors } } =
    useForm({ resolver: zodResolver(uploadSchema) });

  const loadDocs = async () => {
    setLoading(true);
    try {
      const res = await customerService.listKyc(customerId);
      setDocs(res.data?.docs ?? []);
    } catch { /* silently handled below */ }
    finally   { setLoading(false); }
  };

  useEffect(() => { loadDocs(); }, [customerId]); // eslint-disable-line

  // ── Upload ──────────────────────────────────────────────────────────────────
  const onUpload = async (form) => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setFileError('Please select a file.'); return; }
    if (file.size > MAX_MB * 1024 * 1024) {
      setFileError(`File must be ≤ ${MAX_MB} MB.`); return;
    }
    setFileError('');
    setUploading(true);
    try {
      await customerService.submitKyc(customerId, file, form.docType, form.docNumber, form.expiryDate);
      toast.success('Document submitted for review.');
      reset();
      if (fileRef.current) fileRef.current.value = '';
      await loadDocs();
    } catch (err) {
      toast.error(err?.response?.data?.error ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  // ── Verify / Reject ─────────────────────────────────────────────────────────
  const updateStatus = async (kycId, status, rejectionReason = '') => {
    try {
      await customerService.updateKycStatus(customerId, kycId, status, rejectionReason);
      toast.success(`Document ${status === 'verified' ? 'verified' : 'rejected'}.`);
      await loadDocs();
    } catch (err) {
      toast.error(err?.response?.data?.error ?? 'Status update failed.');
    }
  };

  const handleReject = async (kycId) => {
    const reason = window.prompt('Rejection reason (required):');
    if (!reason?.trim()) { toast.error('Rejection reason is required.'); return; }
    await updateStatus(kycId, 'rejected', reason);
  };

  return (
    <div className="space-y-6">
      {/* ── Document list ── */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
          KYC Documents
        </h3>
        {loading ? (
          <InlineLoader label="Loading documents…" />
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-300 py-10 text-gray-400 dark:border-gray-700">
            <FileText className="h-8 w-8" />
            <p className="text-sm">No documents submitted yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map(doc => (
              <div key={doc.id}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="text-sm font-medium capitalize text-gray-800 dark:text-gray-200">
                      {doc.doc_type?.replace(/_/g,' ')}
                    </span>
                    <StatusBadge value={doc.status} />
                  </div>
                  <div className="mt-0.5 flex gap-3 text-xs text-gray-400 dark:text-gray-500">
                    {doc.doc_number && <span>#{doc.doc_number}</span>}
                    {doc.expiry_date && <span>Expires {new Date(doc.expiry_date).toLocaleDateString()}</span>}
                    <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                    {doc.verified_by_name && <span>by {doc.verified_by_name}</span>}
                  </div>
                  {doc.rejection_reason && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      Reason: {doc.rejection_reason}
                    </p>
                  )}
                </div>

                {canVerify && doc.status === 'submitted' && (
                  <div className="ml-4 flex shrink-0 gap-2">
                    <Button size="sm" variant="outline"
                      className="gap-1.5 border-green-500 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400"
                      onClick={() => updateStatus(doc.id, 'verified')}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Verify
                    </Button>
                    <Button size="sm" variant="outline"
                      className="gap-1.5 border-red-400 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                      onClick={() => handleReject(doc.id)}>
                      <XCircle className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Upload form ── */}
      <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          <Upload className="h-4 w-4" />
          Submit New Document
        </h3>
        <form onSubmit={handleSubmit(onUpload)} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Doc type */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Document Type *
              </label>
              <Select {...register('docType')} className="w-full">
                <option value="">— Select —</option>
                {DOC_TYPES.map(t => (
                  <option key={t} value={t}>{t.replace(/_/g,' ')}</option>
                ))}
              </Select>
              <FieldError message={errors.docType?.message} />
            </div>

            {/* Doc number */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Document Number
              </label>
              <Input placeholder="e.g. A1234567" {...register('docNumber')}
                className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
            </div>

            {/* Expiry */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Expiry Date
              </label>
              <Input type="date" {...register('expiryDate')}
                className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
            </div>

            {/* File */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                File (JPEG, PNG, WEBP, PDF — max {MAX_MB} MB) *
              </label>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED}
                onChange={() => setFileError('')}
                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-blue-700 hover:file:bg-blue-100 dark:text-gray-400 dark:file:bg-blue-900/30 dark:file:text-blue-400"
              />
              {fileError && <FieldError message={fileError} />}
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={uploading} className="gap-2">
              {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
              {uploading ? 'Uploading…' : 'Submit Document'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default KycSection;
