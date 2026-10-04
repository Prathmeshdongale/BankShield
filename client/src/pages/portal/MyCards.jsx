/**
 * MyCards.jsx — /portal/cards
 *
 * Customer view of all cards across all their accounts.
 * Strategy: load own accounts first, then fetch cards per account in parallel.
 *
 * Per-card actions (customer has cards:block permission):
 *   Active card  → Block · Report Lost · Report Stolen
 *   Blocked card → (read-only, contact bank message)
 *
 * Loading / empty / error states throughout.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, RefreshCw, ShieldAlert,
  Lock, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import toast                from 'react-hot-toast';
import { accountService }   from '@/services/accountService';
import { cardService }      from '@/services/cardService';
import { StatusBadge }      from '@/components/ui/StatusBadge';
import { Button }           from '@/components/ui/button';
import { InlineLoader }     from '@/components/ui/LoadingOverlay';
import { ErrorMessage }     from '@/components/ui/ErrorMessage';
import Modal                from '@/components/ui/Modal';

// ── visual config ─────────────────────────────────────────────────────────────
const CARD_ICON  = { debit: '🏧', credit: '💳', prepaid: '📋', virtual: '🌐' };
const NET_COLOR  = {
  visa      : 'text-blue-300',
  mastercard: 'text-red-300',
  rupay     : 'text-orange-300',
  amex      : 'text-green-300',
};
const GRAD_BY_STATUS = {
  active  : 'from-gray-700 to-gray-900',
  blocked : 'from-red-900 to-rose-950',
  expired : 'from-gray-600 to-gray-700 opacity-70',
  lost    : 'from-amber-900 to-yellow-950',
  stolen  : 'from-red-950 to-gray-950',
  inactive: 'from-gray-500 to-gray-700 opacity-60',
};

const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—';

// ── Confirm-action modal ──────────────────────────────────────────────────────
const ConfirmModal = ({ open, onClose, onConfirm, loading, title, description, confirmLabel, variant = 'destructive' }) => (
  <Modal open={open} onClose={onClose} title={title} size="sm">
    <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
    <div className="mt-5 flex justify-end gap-3">
      <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
      <Button
        onClick={onConfirm}
        disabled={loading}
        className={`gap-2 ${variant === 'destructive'
          ? 'bg-red-600 hover:bg-red-700 text-white'
          : 'bg-amber-600 hover:bg-amber-700 text-white'}`}
      >
        {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
        {confirmLabel}
      </Button>
    </div>
  </Modal>
);

// ─────────────────────────────────────────────────────────────────────────────
const MyCards = () => {
  const [cards,   setCards]   = useState([]);   // flat list: { ...card, accountNumber }
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Confirm modal state
  const [confirm, setConfirm] = useState(null);
  // { cardId, action: 'block'|'reportLost'|'reportStolen', title, description, label }
  const [acting,  setActing]  = useState('');   // cardId being actioned

  // ── load all cards across all accounts ─────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      // 1. Fetch own accounts
      const acctRes = await accountService.list({ limit: 50 });
      const accounts = acctRes.data?.data ?? [];

      // 2. Fetch cards for each account in parallel
      const results = await Promise.allSettled(
        accounts.map(a =>
          accountService.listCards(a.id, { includeInactive: true })
            .then(r => (r.data?.cards ?? []).map(c => ({
              ...c,
              accountNumber: a.account_number,
              accountId    : a.id,
            })))
        )
      );

      const allCards = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value);

      // Sort: active first, then by expiry desc
      allCards.sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (b.status === 'active' && a.status !== 'active') return  1;
        return 0;
      });

      setCards(allCards);
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to load cards.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── actions ─────────────────────────────────────────────────────────────────
  const runAction = async () => {
    if (!confirm) return;
    const { cardId, action } = confirm;
    setActing(cardId);
    setConfirm(null);
    try {
      if (action === 'block')         await cardService.block(cardId, 'Blocked by cardholder via portal');
      if (action === 'reportLost')    await cardService.reportLost(cardId);
      if (action === 'reportStolen')  await cardService.reportStolen(cardId);
      toast.success(
        action === 'block'        ? 'Card blocked.'           :
        action === 'reportLost'   ? 'Card reported as lost.'  :
                                    'Card reported as stolen.'
      );
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Action failed.');
    } finally {
      setActing('');
    }
  };

  const promptBlock = (cardId) => setConfirm({
    cardId, action: 'block',
    title      : 'Block Card',
    description: 'This will immediately block the card. All transactions will be declined. Contact your branch to unblock.',
    label      : 'Block Card',
  });

  const promptLost = (cardId) => setConfirm({
    cardId, action: 'reportLost',
    title      : 'Report Card Lost',
    description: 'Reporting a card as lost will block it permanently. A replacement card will need to be issued by your branch.',
    label      : 'Report Lost',
    variant    : 'warning',
  });

  const promptStolen = (cardId) => setConfirm({
    cardId, action: 'reportStolen',
    title      : 'Report Card Stolen',
    description: 'Reporting a card as stolen will block it and flag your account for review. A replacement card will be issued by your branch.',
    label      : 'Report Stolen',
  });

  // ── render ──────────────────────────────────────────────────────────────────
  const activeCount  = cards.filter(c => c.status === 'active').length;
  const blockedCount = cards.filter(c => ['blocked','lost','stolen'].includes(c.status)).length;

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <CreditCard className="h-6 w-6 text-blue-600" /> My Cards
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            All cards linked to your accounts.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* ── Summary strip ───────────────────────────────────────────────────── */}
      {!loading && cards.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm dark:border-green-800 dark:bg-green-950/30">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="font-semibold text-green-800 dark:text-green-300">{activeCount}</span>
            <span className="text-green-700 dark:text-green-400">active</span>
          </div>
          {blockedCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm dark:border-red-800 dark:bg-red-950/30">
              <Lock className="h-4 w-4 text-red-500" />
              <span className="font-semibold text-red-800 dark:text-red-300">{blockedCount}</span>
              <span className="text-red-700 dark:text-red-400">blocked / lost / stolen</span>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800">
            <CreditCard className="h-4 w-4 text-gray-400" />
            <span className="font-semibold text-gray-700 dark:text-gray-200">{cards.length}</span>
            <span className="text-gray-500">total cards</span>
          </div>
        </div>
      )}

      <ErrorMessage message={error} />

      {/* ── Card grid ───────────────────────────────────────────────────────── */}
      {loading ? (
        <InlineLoader label="Loading your cards…" />
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 py-16 text-gray-400 dark:border-gray-700">
          <CreditCard className="h-10 w-10" />
          <p className="text-sm">No cards found across your accounts.</p>
          <p className="text-xs text-gray-400">Contact your branch to request a card.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(c => {
            const grad  = GRAD_BY_STATUS[c.status] ?? GRAD_BY_STATUS.inactive;
            const netCls = NET_COLOR[c.network] ?? 'text-gray-300';
            const isActive  = c.status === 'active';
            const isActing  = acting === c.id;

            return (
              <div key={c.id}
                className={`relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br ${grad} p-5 text-white shadow-md`}>

                {/* Top row */}
                <div className="flex items-start justify-between mb-6">
                  <span className="text-xl">{CARD_ICON[c.card_type] ?? '💳'}</span>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge value={c.status}
                      className="border-white/30 bg-white/20 text-white text-[10px]" />
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${netCls}`}>
                      {c.network}
                    </span>
                  </div>
                </div>

                {/* Masked PAN */}
                <p className="font-mono text-sm tracking-widest text-gray-200 mb-1">
                  {c.masked_number ?? '**** **** **** ****'}
                </p>

                {/* Account link */}
                <p className="text-[11px] opacity-50 mb-4">
                  Account: {c.accountNumber}
                </p>

                {/* Expiry + type */}
                <div className="flex items-end justify-between border-t border-white/20 pt-3">
                  <div>
                    <p className="text-[10px] uppercase text-gray-400">Expires</p>
                    <p className="text-sm font-medium">
                      {String(c.expiry_month ?? '').padStart(2, '0')}/{c.expiry_year}
                    </p>
                  </div>
                  <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] capitalize text-gray-300">
                    {c.card_type}
                  </span>
                </div>

                {/* ── Actions ──────────────────────────────────────────────── */}
                {isActive && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-white/20 pt-3">
                    <button
                      onClick={() => promptBlock(c.id)}
                      disabled={isActing}
                      className="flex items-center gap-1.5 rounded-lg bg-red-500/70 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 transition-colors disabled:opacity-50">
                      <Lock className="h-3 w-3" />
                      Block
                    </button>
                    <button
                      onClick={() => promptLost(c.id)}
                      disabled={isActing}
                      className="flex items-center gap-1.5 rounded-lg bg-amber-500/70 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 transition-colors disabled:opacity-50">
                      <AlertTriangle className="h-3 w-3" />
                      Report Lost
                    </button>
                    <button
                      onClick={() => promptStolen(c.id)}
                      disabled={isActing}
                      className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition-colors disabled:opacity-50">
                      <ShieldAlert className="h-3 w-3" />
                      Report Stolen
                    </button>
                  </div>
                )}

                {/* Blocked / lost / stolen notice */}
                {['blocked','lost','stolen'].includes(c.status) && (
                  <div className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs text-red-300 border border-red-400/30">
                    This card is {c.status}. Contact your branch for assistance.
                  </div>
                )}

                {/* Spinner overlay while acting */}
                {isActing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl">
                    <RefreshCw className="h-6 w-6 animate-spin text-white" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Confirm modal ────────────────────────────────────────────────────── */}
      {confirm && (
        <ConfirmModal
          open={!!confirm}
          onClose={() => setConfirm(null)}
          onConfirm={runAction}
          loading={!!acting}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.label}
          variant={confirm.variant}
        />
      )}
    </div>
  );
};

export default MyCards;
