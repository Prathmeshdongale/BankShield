/**
 * Branches.jsx — /branches
 *
 * Features:
 *   • Paginated branch list with search + active/inactive filter
 *   • Create branch modal (admin/super_admin — users:manage_roles)
 *   • Edit branch slide-out drawer
 *   • Deactivate (PATCH /:id/deactivate) + Delete (DELETE /:id) actions
 *   • Read-only detail view for branch_manager role
 *   • Loading / empty / error states throughout
 *
 * Branch fields: code, name, address, city, state, country, phone, email, managerId, isActive
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import {
  Building2, Plus, RefreshCw, Search,
  MapPin, Phone, Mail, X, Edit2,
  PowerOff, Trash2, Loader2, CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { branchService }    from '@/services/branchService';
import { useAuth }          from '@/context/AuthContext';
import { Button }           from '@/components/ui/button';
import { Input }            from '@/components/ui/input';
import Select               from '@/components/ui/Select';
import { StatusBadge }      from '@/components/ui/StatusBadge';
import { Pagination }       from '@/components/ui/Pagination';
import { InlineLoader }     from '@/components/ui/LoadingOverlay';
import { ErrorMessage, FieldError } from '@/components/ui/ErrorMessage';
import Modal                from '@/components/ui/Modal';
import { cn }               from '@/utils/cn';

// ── RBAC ──────────────────────────────────────────────────────────────────────
const WRITE_ROLES  = ['super_admin', 'admin'];
const DELETE_ROLES = ['super_admin', 'admin'];
const LIMIT = 20;

// ── Zod schema ────────────────────────────────────────────────────────────────
const branchSchema = z.object({
  code      : z.string().trim().min(2, 'Code is required (min 2 chars).').max(20),
  name      : z.string().trim().min(2, 'Name is required.').max(120),
  city      : z.string().trim().min(1, 'City is required.').max(60),
  state     : z.string().trim().max(60).optional().or(z.literal('')),
  country   : z.string().trim().max(60).optional().or(z.literal('')),
  address   : z.string().trim().max(255).optional().or(z.literal('')),
  phone     : z.string().trim().max(20).optional().or(z.literal('')),
  email     : z.string().trim().email('Enter a valid email.').optional().or(z.literal('')),
  managerId : z.string().trim().uuid('Must be a valid UUID.').optional().or(z.literal('')),
});

// ── helpers ───────────────────────────────────────────────────────────────────
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—';

const InfoRow = ({ label, value }) =>
  value ? (
    <div className="flex gap-3 border-b border-gray-100 py-2 last:border-0 dark:border-gray-800">
      <span className="w-28 shrink-0 text-xs font-medium text-gray-500">{label}</span>
      <span className="text-sm text-gray-800 dark:text-gray-200 break-all">{value}</span>
    </div>
  ) : null;

// ── BranchForm — shared by Create + Edit ─────────────────────────────────────
const BranchForm = ({ defaultValues, onSubmit, onCancel, submitLabel = 'Save' }) => {
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(branchSchema), defaultValues });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Branch Code *</label>
          <Input {...register('code')} placeholder="e.g. MUM-001"
            className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
          <FieldError message={errors.code?.message} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Branch Name *</label>
          <Input {...register('name')} placeholder="e.g. Mumbai Main Branch"
            className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
          <FieldError message={errors.name?.message} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Address</label>
        <Input {...register('address')} placeholder="Street address"
          className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
        <FieldError message={errors.address?.message} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">City *</label>
          <Input {...register('city')} placeholder="e.g. Mumbai"
            className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
          <FieldError message={errors.city?.message} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">State</label>
          <Input {...register('state')} placeholder="e.g. Maharashtra"
            className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
          <FieldError message={errors.state?.message} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Country</label>
          <Input {...register('country')} placeholder="e.g. India"
            className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
          <FieldError message={errors.country?.message} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Phone</label>
          <Input {...register('phone')} type="tel" placeholder="+91 22 1234 5678"
            className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
          <FieldError message={errors.phone?.message} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Email</label>
        <Input {...register('email')} type="email" placeholder="branch@bankshield.in"
          className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
        <FieldError message={errors.email?.message} />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
          Manager ID <span className="font-normal text-gray-400">(UUID — optional)</span>
        </label>
        <Input {...register('managerId')} placeholder="User UUID of the branch manager"
          className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
        <FieldError message={errors.managerId?.message} />
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} className="gap-2">
          {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
};

// ── Detail / Edit Drawer ──────────────────────────────────────────────────────
const BranchDrawer = ({ branch, canWrite, canDelete, onClose, onUpdated, onDeleted }) => {
  const [mode,        setMode]        = useState('detail'); // 'detail' | 'edit'
  const [deactivating,setDeactivating]= useState(false);
  const [deleting,    setDeleting]    = useState(false);

  useEffect(() => {
    if (!branch) return;
    setMode('detail');
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [branch, onClose]);

  const handleEdit = async (values) => {
    try {
      await branchService.update(branch.id, values);
      toast.success('Branch updated.');
      onUpdated();
      setMode('detail');
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Update failed.');
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm(`Deactivate "${branch.name}"?`)) return;
    setDeactivating(true);
    try {
      await branchService.deactivate(branch.id);
      toast.success('Branch deactivated.');
      onUpdated();
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Failed.');
    } finally { setDeactivating(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Permanently delete "${branch.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await branchService.delete(branch.id);
      toast.success('Branch deleted.');
      onDeleted();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Delete failed.');
    } finally { setDeleting(false); }
  };

  return (
    <>
      {branch && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      )}
      <aside className={cn(
        'fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l bg-white shadow-2xl transition-transform duration-300',
        'border-gray-200 dark:border-gray-800 dark:bg-gray-900',
        branch ? 'translate-x-0' : 'translate-x-full'
      )}>
        {branch && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Branch</p>
                <p className="mt-0.5 font-mono text-sm font-bold text-gray-700 dark:text-gray-300">
                  {branch.code}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge value={branch.is_active ? 'active' : 'inactive'} />
                <button onClick={onClose}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Tab strip */}
            {canWrite && (
              <div className="flex border-b border-gray-100 dark:border-gray-800">
                {['detail', 'edit'].map(t => (
                  <button key={t} onClick={() => setMode(t)}
                    className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${
                      mode === t
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}>{t}</button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {mode === 'detail' ? (
                <div className="space-y-5">
                  {/* Info */}
                  <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
                    <InfoRow label="Name"       value={branch.name} />
                    <InfoRow label="Code"       value={branch.code} />
                    <InfoRow label="Address"    value={branch.address} />
                    <InfoRow label="City"       value={branch.city} />
                    <InfoRow label="State"      value={branch.state} />
                    <InfoRow label="Country"    value={branch.country} />
                    <InfoRow label="Phone"      value={branch.phone} />
                    <InfoRow label="Email"      value={branch.email} />
                    <InfoRow label="Manager ID" value={branch.manager_id} />
                    <InfoRow label="Opened"     value={fmtDate(branch.created_at)} />
                    <InfoRow label="Updated"    value={fmtDate(branch.updated_at)} />
                  </div>

                  {/* Stats chips */}
                  {(branch.account_count != null || branch.staff_count != null) && (
                    <div className="flex gap-3">
                      {branch.account_count != null && (
                        <div className="flex-1 rounded-xl border border-gray-200 bg-white p-3 text-center dark:border-gray-700 dark:bg-gray-800">
                          <p className="text-xl font-bold text-blue-600">{branch.account_count}</p>
                          <p className="text-xs text-gray-500">Accounts</p>
                        </div>
                      )}
                      {branch.staff_count != null && (
                        <div className="flex-1 rounded-xl border border-gray-200 bg-white p-3 text-center dark:border-gray-700 dark:bg-gray-800">
                          <p className="text-xl font-bold text-indigo-600">{branch.staff_count}</p>
                          <p className="text-xs text-gray-500">Staff</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Danger zone */}
                  {canWrite && (
                    <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-800 dark:bg-red-950/20">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-500">
                        Danger Zone
                      </p>
                      {branch.is_active && (
                        <Button variant="outline" size="sm"
                          className="w-full gap-2 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400"
                          disabled={deactivating}
                          onClick={handleDeactivate}>
                          {deactivating
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <PowerOff className="h-3.5 w-3.5" />}
                          Deactivate Branch
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="outline" size="sm"
                          className="w-full gap-2 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                          disabled={deleting}
                          onClick={handleDelete}>
                          {deleting
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                          Delete Branch
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <BranchForm
                  defaultValues={{
                    code     : branch.code      ?? '',
                    name     : branch.name      ?? '',
                    address  : branch.address   ?? '',
                    city     : branch.city      ?? '',
                    state    : branch.state     ?? '',
                    country  : branch.country   ?? '',
                    phone    : branch.phone     ?? '',
                    email    : branch.email     ?? '',
                    managerId: branch.manager_id ?? '',
                  }}
                  onSubmit={handleEdit}
                  onCancel={() => setMode('detail')}
                  submitLabel="Save Changes"
                />
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const Branches = () => {
  const { hasRole }  = useAuth();
  const canWrite     = hasRole(WRITE_ROLES);
  const canDelete    = hasRole(DELETE_ROLES);

  const [branches,   setBranches]   = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [search,     setSearch]     = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [page,       setPage]       = useState(1);
  const [selected,   setSelected]   = useState(null);   // for drawer
  const [showCreate, setShowCreate] = useState(false);

  // ── load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async (pg = page) => {
    setLoading(true); setError('');
    try {
      const res = await branchService.list({
        search    : search || undefined,
        isActive  : activeOnly ? 'true' : undefined,
        limit     : LIMIT,
        offset    : (pg - 1) * LIMIT,
      });
      setBranches(res.data?.data ?? res.data?.branches ?? []);
      setPagination(res.data?.pagination ?? null);
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to load branches.');
    } finally { setLoading(false); }
  }, [search, activeOnly, page]);

  useEffect(() => { load(page); }, [search, activeOnly, page]); // eslint-disable-line

  // ── create ────────────────────────────────────────────────────────────────
  const handleCreate = async (values) => {
    try {
      await branchService.create(values);
      toast.success('Branch created.');
      setShowCreate(false);
      load(1);
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Failed to create branch.');
    }
  };

  // After edit or deactivate, re-fetch current page + update selected
  const handleUpdated = async () => {
    await load(page);
    if (selected) {
      try {
        const res = await branchService.get(selected.id);
        setSelected(res.data?.branch ?? null);
      } catch { setSelected(null); }
    }
  };

  const handleDeleted = () => {
    load(page);
    setSelected(null);
  };

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <Building2 className="h-6 w-6 text-blue-600" /> Branches
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Physical and virtual bank branches.
          </p>
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> New Branch
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or code…"
            className="pl-9 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-400 select-none">
          <input type="checkbox" checked={activeOnly}
            onChange={e => { setActiveOnly(e.target.checked); setPage(1); }}
            className="h-4 w-4 rounded border-gray-300 accent-blue-600" />
          Active only
        </label>
      </div>

      <ErrorMessage message={error} />

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <InlineLoader label="Loading branches…" />
      ) : branches.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 py-16 text-gray-400 dark:border-gray-700">
          <Building2 className="h-10 w-10" />
          <p className="text-sm">{search ? 'No branches match your search.' : 'No branches found.'}</p>
          {canWrite && !search && (
            <Button size="sm" variant="outline" onClick={() => setShowCreate(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Create first branch
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900 text-left">
                  {['Code', 'Name', 'Location', 'Contact', 'Status', 'Created', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {branches.map(b => (
                  <tr key={b.id}
                    onClick={() => setSelected(b)}
                    className="cursor-pointer bg-white hover:bg-blue-50/40 dark:bg-gray-900 dark:hover:bg-gray-800/60">

                    <td className="px-4 py-3 font-mono text-xs font-bold text-gray-600 dark:text-gray-300">
                      {b.code}
                    </td>

                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[180px]">
                      <p className="truncate">{b.name}</p>
                    </td>

                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1 text-xs">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {[b.city, b.state, b.country].filter(Boolean).join(', ') || '—'}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                      {b.phone && (
                        <p className="flex items-center gap-1">
                          <Phone className="h-3 w-3 shrink-0" /> {b.phone}
                        </p>
                      )}
                      {b.email && (
                        <p className="flex items-center gap-1">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[140px]">{b.email}</span>
                        </p>
                      )}
                      {!b.phone && !b.email && '—'}
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge value={b.is_active ? 'active' : 'inactive'} />
                    </td>

                    <td className="px-4 py-3 text-xs text-gray-400">
                      {fmtDate(b.created_at)}
                    </td>

                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {canWrite && (
                          <Button size="sm" variant="outline"
                            className="h-7 gap-1 text-xs"
                            onClick={() => { setSelected(b); }}>
                            <Edit2 className="h-3 w-3" /> Edit
                          </Button>
                        )}
                        {!canWrite && (
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => setSelected(b)}>
                            View
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
              <span>{pagination.total} branch{pagination.total !== 1 ? 'es' : ''}</span>
              <Pagination page={pagination.page} pages={pagination.pages}
                onPage={p => setPage(p)} />
            </div>
          )}
        </>
      )}

      {/* ── Create modal ─────────────────────────────────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New Branch" size="md">
        <BranchForm
          defaultValues={{ code:'', name:'', city:'', state:'', country:'India', address:'', phone:'', email:'', managerId:'' }}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
          submitLabel="Create Branch"
        />
      </Modal>

      {/* ── Detail / Edit drawer ─────────────────────────────────────────────── */}
      <BranchDrawer
        branch={selected}
        canWrite={canWrite}
        canDelete={canDelete}
        onClose={() => setSelected(null)}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
    </div>
  );
};

export default Branches;
