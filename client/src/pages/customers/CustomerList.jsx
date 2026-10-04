/**
 * CustomerList — main /customers index page.
 * Search · filter · paginate · open detail or create modal.
 */
import React, { useState } from 'react';
import { UserPlus, Users }  from 'lucide-react';
import toast                from 'react-hot-toast';

import { useCustomers }      from '@/hooks/useCustomers';
import { customerService }   from '@/services/customerService';
import { Button }            from '@/components/ui/button';
import Modal                 from '@/components/ui/Modal';
import { ErrorMessage }      from '@/components/ui/ErrorMessage';
import { useAuth }           from '@/context/AuthContext';

import { CustomerFilters }   from './CustomerFilters';
import { CustomerTable }     from './CustomerTable';
import { CustomerForm }      from './CustomerForm';

const WRITE_ROLES = ['super_admin','admin','branch_manager'];

const CustomerList = () => {
  const { hasRole } = useAuth();
  const canCreate   = hasRole(WRITE_ROLES);

  const {
    customers, pagination, loading, error,
    filters, setFilters, reload,
  } = useCustomers();

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [deactTarget, setDeactTarget] = useState(null);

  // ── Create ─────────────────────────────────────────────────────────────────
  const handleCreate = async (data) => {
    setCreateError('');
    try {
      await customerService.create(data);
      toast.success('Customer created.');
      setCreateOpen(false);
      reload();
    } catch (err) {
      const msg = err?.response?.data?.error ?? 'Failed to create customer.';
      setCreateError(msg);
      throw err; // let form stay open with error
    }
  };

  // ── Deactivate ─────────────────────────────────────────────────────────────
  const handleDeactivate = async () => {
    if (!deactTarget) return;
    try {
      await customerService.deactivate(deactTarget.id);
      toast.success(`${deactTarget.first_name} deactivated.`);
      setDeactTarget(null);
      reload();
    } catch (err) {
      toast.error(err?.response?.data?.error ?? 'Deactivation failed.');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <Users className="h-6 w-6 text-blue-600" />
            Customers
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage customer profiles, risk ratings, and KYC documents.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => { setCreateError(''); setCreateOpen(true); }} className="gap-2">
            <UserPlus className="h-4 w-4" />
            New Customer
          </Button>
        )}
      </div>

      {/* Filters */}
      <CustomerFilters
        filters={filters}
        onChange={updates => setFilters(updates)}
        loading={loading}
      />

      {/* Table */}
      <CustomerTable
        customers={customers}
        pagination={pagination}
        loading={loading}
        error={error}
        filters={filters}
        onPageChange={p => setFilters({ page: p })}
        onDeactivate={c => setDeactTarget(c)}
      />

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Customer" size="lg">
        {createError && <ErrorMessage message={createError} className="mb-4" />}
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          The customer profile will be linked to an existing user account. Enter the <code>userId</code> below or create a user first.
        </p>
        {/* userId field */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">User ID *</label>
          <input
            id="userId-field"
            placeholder="UUID of the linked user account"
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <CustomerForm
          onSubmit={async (data) => {
            const userId = document.getElementById('userId-field')?.value?.trim();
            if (!userId) { setCreateError('User ID is required.'); return; }
            await handleCreate({ ...data, userId });
          }}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>

      {/* Deactivate confirm */}
      <Modal open={!!deactTarget} onClose={() => setDeactTarget(null)} title="Deactivate Customer" size="sm">
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Deactivate <strong>{deactTarget?.first_name} {deactTarget?.last_name}</strong>?
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeactTarget(null)}>Cancel</Button>
          <Button variant="destructive" onClick={handleDeactivate}>Deactivate</Button>
        </div>
      </Modal>
    </div>
  );
};

export default CustomerList;
