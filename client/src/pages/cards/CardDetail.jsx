/**
 * CardDetail — /cards/:id
 * Shows masked card info, status actions, and limit management.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Lock, Unlock, AlertTriangle, Skull,
  RefreshCw, Plus, Trash2, Loader2,
} from 'lucide-react';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import toast from 'react-hot-toast';

import { cardService }   from '@/services/cardService';
import { useAuth }       from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button }        from '@/components/ui/button';
import { Input }         from '@/components/ui/input';
import Select            from '@/components/ui/Select';
import { StatusBadge }   from '@/components/ui/StatusBadge';
import { InlineLoader }  from '@/components/ui/LoadingOverlay';
import { ErrorMessage, FieldError } from '@/components/ui/ErrorMessage';
import Modal             from '@/components/ui/Modal';

const BLOCK_ROLES   = ['super_admin','admin','compliance_officer','branch_manager','teller'];
const LIMIT_ROLES   = ['super_admin','admin','branch_manager'];
const REPLACE_ROLES = ['super_admin','admin','branch_manager'];

const LIMIT_TYPES = ['daily_atm','daily_pos','daily_online','single_txn','monthly','contactless'];

const limitSchema = z.object({
  limitType   : z.enum(LIMIT_TYPES, { required_error:'Required.' }),
  amountLimit : z.coerce.number().min(1,'Must be ≥ 1.'),
});

const LimitForm = ({ onSubmit, onCancel }) => {
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(limitSchema) });
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Limit Type *</label>
        <Select {...register('limitType')} className="w-full">
          <option value="">— Select —</option>
          {LIMIT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
        </Select>
        <FieldError message={errors.limitType?.message} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Amount Limit (₹) *</label>
        <Input type="number" min="1" placeholder="e.g. 20000" {...register('amountLimit')}
          className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
        <FieldError message={errors.amountLimit?.message} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting} className="gap-2">
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Set Limit
        </Button>
      </div>
    </form>
  );
};

const BlockForm = ({ onSubmit, onCancel }) => {
  const [reason, setReason] = useState('');
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Reason (optional)</label>
        <Input value={reason} onChange={e => setReason(e.target.value)}
          placeholder="e.g. Suspicious activity" className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
      </div>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button variant="destructive" onClick={() => onSubmit(reason)}>Block Card</Button>
      </div>
    </div>
  );
};

const CardDetail = () => {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const { hasRole }  = useAuth();

  const [card,       setCard]       = useState(null);
  const [limits,     setLimits]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [blockOpen,  setBlockOpen]  = useState(false);
  const [limitOpen,  setLimitOpen]  = useState(false);
  const [replaceOpen,setReplaceOpen]= useState(false);
  const [replacing,  setReplacing]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [cr, lr] = await Promise.all([cardService.get(id), cardService.listLimits(id)]);
      setCard(cr.data?.card ?? null);
      setLimits(lr.data?.limits ?? []);
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to load card.');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleBlock = async (reason) => {
    await cardService.block(id, reason);
    toast.success('Card blocked.');
    setBlockOpen(false);
    load();
  };

  const handleUnblock = async () => {
    await cardService.unblock(id);
    toast.success('Card unblocked.');
    load();
  };

  const handleReport = async (type) => {
    await (type === 'lost' ? cardService.reportLost(id) : cardService.reportStolen(id));
    toast.success(`Card reported as ${type}.`);
    load();
  };

  const handleReplace = async () => {
    setReplacing(true);
    try {
      await cardService.replace(id);
      toast.success('Card replaced. New card issued.');
      setReplaceOpen(false);
      navigate(-1);
    } finally { setReplacing(false); }
  };

  const handleSetLimit = async (data) => {
    await cardService.setLimit(id, data.limitType, { amountLimit: data.amountLimit });
    toast.success('Limit set.');
    setLimitOpen(false);
    const lr = await cardService.listLimits(id);
    setLimits(lr.data?.limits ?? []);
  };

  const handleDeleteLimit = async (limitType) => {
    await cardService.deleteLimit(id, limitType);
    toast.success('Limit deleted.');
    const lr = await cardService.listLimits(id);
    setLimits(lr.data?.limits ?? []);
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><InlineLoader /></div>;
  if (error)   return <div className="p-6"><ErrorMessage message={error} /></div>;
  if (!card)   return null;

  const c = card;
  const isActive  = c.status === 'active';
  const isBlocked = c.status === 'blocked';
  const isTerminal= ['lost','stolen','expired'].includes(c.status);
  const isReplaceable = ['blocked','lost','stolen'].includes(c.status);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-mono text-lg font-bold text-gray-900 dark:text-white">{c.masked_number}</h1>
            <p className="text-xs text-gray-500 capitalize dark:text-gray-400">
              {c.card_type} · {c.network} · expires {String(c.expiry_month).padStart(2,'0')}/{c.expiry_year}
            </p>
          </div>
          <StatusBadge value={c.status} />
        </div>

        <div className="flex flex-wrap gap-2">
          {isActive && hasRole(BLOCK_ROLES) && (
            <Button size="sm" variant="outline"
              className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => setBlockOpen(true)}>
              <Lock className="h-3.5 w-3.5" /> Block
            </Button>
          )}
          {isBlocked && hasRole(BLOCK_ROLES) && (
            <Button size="sm" variant="outline"
              className="gap-1.5 border-green-400 text-green-700 hover:bg-green-50"
              onClick={handleUnblock}>
              <Unlock className="h-3.5 w-3.5" /> Unblock
            </Button>
          )}
          {!isTerminal && hasRole(BLOCK_ROLES) && (
            <>
              <Button size="sm" variant="outline"
                className="gap-1.5 border-yellow-400 text-yellow-700 hover:bg-yellow-50"
                onClick={() => handleReport('lost')}>
                <AlertTriangle className="h-3.5 w-3.5" /> Lost
              </Button>
              <Button size="sm" variant="outline"
                className="gap-1.5 border-red-400 text-red-700 hover:bg-red-50"
                onClick={() => handleReport('stolen')}>
                <Skull className="h-3.5 w-3.5" /> Stolen
              </Button>
            </>
          )}
          {isReplaceable && hasRole(REPLACE_ROLES) && (
            <Button size="sm" className="gap-1.5" onClick={() => setReplaceOpen(true)}>
              <RefreshCw className="h-3.5 w-3.5" /> Replace
            </Button>
          )}
        </div>
      </div>

      {/* Info + Limits */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Card info */}
        <Card><CardContent className="pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Card Details</p>
          {[
            ['Card Type',  c.card_type],
            ['Network',    c.network],
            ['Last 4',     c.card_last4],
            ['Expiry',     `${String(c.expiry_month).padStart(2,'0')}/${c.expiry_year}`],
            ['Status',     <StatusBadge value={c.status} />],
            ['Issued',     c.issued_at ? new Date(c.issued_at).toLocaleDateString() : null],
            ['Account #',  c.account_number],
            ['Customer',   `${c.customer_first_name} ${c.customer_last_name}`],
            ...(c.blocked_reason ? [['Block Reason', c.blocked_reason]] : []),
          ].map(([l, v]) => v && (
            <div key={l} className="flex gap-4 border-b border-gray-100 py-2 last:border-0 dark:border-gray-800">
              <span className="w-36 shrink-0 text-xs font-medium text-gray-500">{l}</span>
              <span className="text-sm text-gray-900 dark:text-gray-200 capitalize">{v}</span>
            </div>
          ))}
        </CardContent></Card>

        {/* Limits */}
        <Card><CardContent className="pt-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Spending Limits</p>
            {isActive && hasRole(LIMIT_ROLES) && (
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setLimitOpen(true)}>
                <Plus className="h-3 w-3" /> Set Limit
              </Button>
            )}
          </div>
          {limits.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No limits configured.</p>
          ) : (
            <div className="space-y-2">
              {limits.map(l => (
                <div key={l.limit_type}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
                  <div>
                    <p className="text-sm font-medium capitalize text-gray-700 dark:text-gray-300">
                      {l.limit_type.replace(/_/g,' ')}
                    </p>
                    <p className="text-xs text-gray-400">
                      ₹{Number(l.amount_limit).toLocaleString()}
                    </p>
                  </div>
                  {hasRole(LIMIT_ROLES) && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600"
                      onClick={() => handleDeleteLimit(l.limit_type)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      </div>

      {/* Block modal */}
      <Modal open={blockOpen} onClose={() => setBlockOpen(false)} title="Block Card" size="sm">
        <BlockForm onSubmit={handleBlock} onCancel={() => setBlockOpen(false)} />
      </Modal>

      {/* Set limit modal */}
      <Modal open={limitOpen} onClose={() => setLimitOpen(false)} title="Set Card Limit" size="sm">
        <LimitForm onSubmit={handleSetLimit} onCancel={() => setLimitOpen(false)} />
      </Modal>

      {/* Replace confirm */}
      <Modal open={replaceOpen} onClose={() => setReplaceOpen(false)} title="Replace Card" size="sm">
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          This will retire <strong>{c.masked_number}</strong> and issue a new card on the same account.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setReplaceOpen(false)}>Cancel</Button>
          <Button onClick={handleReplace} disabled={replacing} className="gap-2">
            {replacing && <Loader2 className="h-4 w-4 animate-spin" />}
            {replacing ? 'Replacing…' : 'Replace Card'}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default CardDetail;
