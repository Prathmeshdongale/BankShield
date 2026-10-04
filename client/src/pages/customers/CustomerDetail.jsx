/**
 * CustomerDetail — full profile view with tabs: Overview · KYC · Accounts
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate }  from 'react-router-dom';
import { ArrowLeft, Pencil, UserX, Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

import { customerService }  from '@/services/customerService';
import { Card, CardContent } from '@/components/ui/card';
import { Button }            from '@/components/ui/button';
import { StatusBadge }       from '@/components/ui/StatusBadge';
import { ErrorMessage }      from '@/components/ui/ErrorMessage';
import { InlineLoader }      from '@/components/ui/LoadingOverlay';
import Modal                 from '@/components/ui/Modal';
import { CustomerForm }      from './CustomerForm';
import { KycSection }        from './KycSection';
import { useAuth }           from '@/context/AuthContext';

const WRITE_ROLES = ['super_admin','admin','compliance_officer','branch_manager'];

const TABS = ['Overview','KYC Documents'];

const InfoRow = ({ label, value }) => (
  <div className="flex gap-4 py-2.5 border-b border-gray-100 last:border-0 dark:border-gray-800">
    <span className="w-40 shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
    <span className="text-sm text-gray-900 dark:text-gray-200">{value ?? '—'}</span>
  </div>
);

const CustomerDetail = () => {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const { hasRole }  = useAuth();
  const canWrite     = hasRole(WRITE_ROLES);

  const [customer,  setCustomer]  = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [tab,       setTab]       = useState('Overview');
  const [editOpen,  setEditOpen]  = useState(false);
  const [deactOpen, setDeactOpen] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await customerService.get(id);
      setCustomer(res.data?.customer ?? null);
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Failed to load customer.');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]); // eslint-disable-line

  const handleUpdate = async (data) => {
    try {
      await customerService.update(id, data);
      toast.success('Customer updated.');
      setEditOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.error ?? 'Update failed.');
    }
  };

  const handleDeactivate = async () => {
    try {
      await customerService.deactivate(id);
      toast.success('Customer deactivated.');
      navigate('/customers');
    } catch (err) {
      toast.error(err?.response?.data?.error ?? 'Deactivation failed.');
    }
  };

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <InlineLoader label="Loading customer…" />
    </div>
  );

  if (error) return (
    <div className="p-6">
      <ErrorMessage message={error} title="Failed to load customer" />
    </div>
  );

  if (!customer) return null;

  const c = customer;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/customers')} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {c.first_name} {c.last_name}
            </h1>
            <p className="font-mono text-xs text-gray-400">{c.customer_number}</p>
          </div>
          <StatusBadge value={c.risk_rating} />
          <StatusBadge value={c.segment} />
          {c.is_pep && <StatusBadge value="PEP" label="PEP" />}
        </div>

        {canWrite && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button variant="outline" size="sm"
              className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
              onClick={() => setDeactOpen(true)}>
              <UserX className="h-3.5 w-3.5" />
              Deactivate
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Personal</p>
              <InfoRow label="Email"          value={c.email} />
              <InfoRow label="Phone"          value={c.user_phone} />
              <InfoRow label="Date of Birth"  value={c.date_of_birth ? new Date(c.date_of_birth).toLocaleDateString() : null} />
              <InfoRow label="Gender"         value={c.gender?.replace(/_/g,' ')} />
              <InfoRow label="Nationality"    value={c.nationality} />
              <InfoRow label="Occupation"     value={c.occupation} />
              <InfoRow label="Annual Income"  value={c.annual_income ? `₹${Number(c.annual_income).toLocaleString()}` : null} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Risk Profile</p>
              <InfoRow label="Risk Rating"    value={<StatusBadge value={c.risk_rating} />} />
              <InfoRow label="Segment"        value={<StatusBadge value={c.segment} />} />
              <InfoRow label="PEP"            value={c.is_pep ? 'Yes' : 'No'} />
              <InfoRow label="Member Since"   value={new Date(c.created_at).toLocaleDateString()} />
              <InfoRow label="Last Updated"   value={new Date(c.updated_at).toLocaleDateString()} />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'KYC Documents' && (
        <Card>
          <CardContent className="pt-4">
            <KycSection customerId={id} />
          </CardContent>
        </Card>
      )}

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Customer" size="lg">
        <CustomerForm
          isEdit
          defaultValues={{
            dateOfBirth  : c.date_of_birth?.slice(0,10) ?? '',
            gender       : c.gender       ?? '',
            nationality  : c.nationality  ?? '',
            occupation   : c.occupation   ?? '',
            annualIncome : c.annual_income ?? '',
            riskRating   : c.risk_rating  ?? '',
            isPep        : !!c.is_pep,
            segment      : c.segment      ?? '',
          }}
          onSubmit={handleUpdate}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      {/* Confirm deactivate */}
      <Modal open={deactOpen} onClose={() => setDeactOpen(false)} title="Deactivate Customer" size="sm">
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Are you sure you want to deactivate <strong>{c.first_name} {c.last_name}</strong>?
          This action can't be undone from the UI.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeactOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleDeactivate}>Deactivate</Button>
        </div>
      </Modal>
    </div>
  );
};

export default CustomerDetail;
