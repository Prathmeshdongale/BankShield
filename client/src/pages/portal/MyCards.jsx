/**
 * MyCards.jsx — /portal/cards
 *
 * Customer view of all cards across all their accounts.
 * Strategy: load own accounts first, then fetch cards per account in parallel.
 *
 * Features:
 *   • Issue new card (Debit, Credit, Virtual, Prepaid across RuPay, Visa, Mastercard)
 *   • Remove / delete card with confirmation
 *   • Block card, report lost, report stolen
 *   • Live status badges, network color coding, expiry displays
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, RefreshCw, ShieldAlert, ShieldCheck,
  Lock, AlertTriangle, CheckCircle2, Plus, Trash2, Globe
} from 'lucide-react';
import toast from 'react-hot-toast';
import { accountService } from '@/services/accountService';
import { cardService } from '@/services/cardService';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { InlineLoader } from '@/components/ui/LoadingOverlay';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import { SecurityOtpModal } from '@/components/security/SecurityOtpModal';

// ── visual config ─────────────────────────────────────────────────────────────
const CARD_ICON  = { debit: '🏧', credit: '💳', prepaid: '📋', virtual: '🌐' };
const NET_COLOR  = {
  visa      : 'text-blue-300',
  mastercard: 'text-red-300',
  rupay     : 'text-orange-300',
  amex      : 'text-green-300',
  other     : 'text-gray-300',
};
const GRAD_BY_STATUS = {
  active  : 'from-gray-700 to-gray-900',
  blocked : 'from-red-900 to-rose-950',
  expired : 'from-gray-600 to-gray-700 opacity-70',
  lost    : 'from-amber-900 to-yellow-950',
  stolen  : 'from-red-950 to-gray-950',
  inactive: 'from-gray-500 to-gray-700 opacity-60',
};

const CARD_TYPE_OPTIONS = [
  { value: 'debit',   label: 'Debit Card',   desc: 'Linked directly to account checking & ATM' },
  { value: 'credit',  label: 'Credit Card',  desc: 'Credit line with 5-year validity' },
  { value: 'virtual', label: 'Virtual Card', desc: 'Secure digital card for online shopping' },
  { value: 'prepaid', label: 'Prepaid Card', desc: 'Pre-loaded wallet card' },
];

const NETWORK_OPTIONS = [
  { value: 'rupay',      label: 'RuPay (Domestic & International)' },
  { value: 'visa',       label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
];

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
  const [cards,       setCards]       = useState([]);   // flat list: { ...card, accountNumber }
  const [accounts,    setAccounts]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  // Link card modal state
  const [isIssuingModal, setIsIssuingModal] = useState(false);
  const [submittingIssue, setSubmittingIssue] = useState(false);
  const [issueForm, setIssueForm] = useState({
    accountId: '',
    cardType: 'debit',
    network: 'rupay',
    lastFour: '',
    expiryMonth: '12',
    expiryYear: '2029',
  });

  // Confirm modal state
  const [confirm, setConfirm] = useState(null);
  const [acting,  setActing]  = useState('');

  // Security OTP modal state for high-risk card actions (removal)
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpCard,      setOtpCard]      = useState(null);

  // ── load all cards across all accounts ─────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      // 1. Fetch own accounts
      const acctRes = await accountService.list({ limit: 50 });
      const myAccounts = acctRes.data?.data ?? [];
      setAccounts(myAccounts);

      if (myAccounts.length > 0 && !issueForm.accountId) {
        setIssueForm(f => ({ ...f, accountId: myAccounts[0].id }));
      }

      // 2. Fetch cards for each account in parallel
      const results = await Promise.allSettled(
        myAccounts.map(a =>
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
  }, []); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  // ── handle link existing card ──────────────────────────────────────────────
  const handleIssueCard = async (e) => {
    e.preventDefault();
    if (!issueForm.accountId) {
      toast.error('Please select an active account for card linking.');
      return;
    }
    setSubmittingIssue(true);
    try {
      await cardService.issue(issueForm.accountId, {
        cardType: issueForm.cardType,
        network: issueForm.network,
        lastFour: issueForm.lastFour?.trim() || undefined,
        expiryMonth: issueForm.expiryMonth ? parseInt(issueForm.expiryMonth, 10) : undefined,
        expiryYear: issueForm.expiryYear ? parseInt(issueForm.expiryYear, 10) : undefined,
      });
      toast.success('Card linked and verified for fraud monitoring!');
      setIsIssuingModal(false);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.error ?? 'Failed to link card.');
    } finally {
      setSubmittingIssue(false);
    }
  };

  // ── actions ─────────────────────────────────────────────────────────────────
  const runAction = async () => {
    if (!confirm) return;
    const { cardId, action, maskedPan } = confirm;

    if (action === 'remove') {
      // Step-up security verification required for card deletion
      setOtpCard({ cardId, maskedPan: maskedPan || '••••' });
      setConfirm(null);
      setShowOtpModal(true);
      return;
    }

    setActing(cardId);
    setConfirm(null);
    try {
      if (action === 'block')        await cardService.block(cardId, 'Blocked by cardholder via portal');
      if (action === 'reportLost')   await cardService.reportLost(cardId);
      if (action === 'reportStolen') await cardService.reportStolen(cardId);

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

  const handleVerifiedRemove = async (verificationToken) => {
    if (!otpCard) return;
    setActing(otpCard.cardId);
    try {
      await cardService.delete(otpCard.cardId);
      toast.success('Card removed successfully after security verification.');
      setShowOtpModal(false);
      setOtpCard(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Failed to remove card.');
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
    description: 'Reporting a card as lost will block it permanently. A replacement card can be issued at any time.',
    label      : 'Report Lost',
    variant    : 'warning',
  });

  const promptStolen = (cardId) => setConfirm({
    cardId, action: 'reportStolen',
    title      : 'Report Card Stolen',
    description: 'Reporting a card as stolen will block it and flag your account for fraud prevention review.',
    label      : 'Report Stolen',
  });

  const promptRemove = (cardId, maskedPan) => setConfirm({
    cardId, action: 'remove', maskedPan,
    title      : 'Remove Card',
    description: `Are you sure you want to remove card ${maskedPan}? For security, a 6-digit one-time code will be dispatched to your registered email to authorize this deletion.`,
    label      : 'Proceed to Security Verification',
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
            Manage your physical and virtual cards, issue new cards, or cancel existing cards.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            onClick={() => setIsIssuingModal(true)}
            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
            size="sm"
          >
            <Plus className="h-4 w-4" /> Link Existing Card
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
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
          <CreditCard className="h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm">No cards found across your accounts.</p>
          <Button
            size="sm"
            onClick={() => setIsIssuingModal(true)}
            className="mt-2 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4" /> Issue Your First Card
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(c => {
            const grad  = GRAD_BY_STATUS[c.status] ?? GRAD_BY_STATUS.inactive;
            const netCls = NET_COLOR[c.network] ?? 'text-gray-300';
            const isActive  = c.status === 'active';
            const isActing  = acting === c.id;

            return (
              <div
                key={c.id}
                className={`relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br ${grad} p-5 text-white shadow-md hover:shadow-lg transition-all`}
              >
                {/* Top row */}
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{CARD_ICON[c.card_type] ?? '💳'}</span>
                    <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] uppercase font-semibold tracking-wider text-gray-200">
                      {c.card_type}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge
                      value={c.status}
                      className="border-white/30 bg-white/20 text-white text-[10px]"
                    />
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${netCls}`}>
                      {c.network}
                    </span>
                  </div>
                </div>

                {/* Masked PAN */}
                <p className="font-mono text-base tracking-widest text-gray-100 mb-1 font-semibold">
                  {c.masked_number ?? '**** **** **** ****'}
                </p>

                {/* Account link */}
                <p className="text-[11px] opacity-60 mb-4">
                  Linked Account: <span className="font-mono">{c.accountNumber}</span>
                </p>

                {/* Expiry */}
                <div className="flex items-end justify-between border-t border-white/20 pt-3">
                  <div>
                    <p className="text-[10px] uppercase text-gray-400">Expires</p>
                    <p className="text-sm font-medium">
                      {String(c.expiry_month ?? '').padStart(2, '0')}/{c.expiry_year}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => promptRemove(c.id, c.masked_number)}
                    disabled={isActing}
                    className="flex items-center gap-1 rounded bg-white/10 hover:bg-rose-600/80 px-2 py-1 text-[11px] font-medium text-white transition disabled:opacity-50"
                    title="Remove or cancel card"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Remove</span>
                  </button>
                </div>

                {/* ── Actions ──────────────────────────────────────────────── */}
                {isActive && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/20 pt-3">
                    <button
                      onClick={() => promptBlock(c.id)}
                      disabled={isActing}
                      className="flex items-center gap-1 rounded-md bg-red-500/70 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500 transition-colors disabled:opacity-50"
                    >
                      <Lock className="h-3 w-3" /> Block
                    </button>
                    <button
                      onClick={() => promptLost(c.id)}
                      disabled={isActing}
                      className="flex items-center gap-1 rounded-md bg-amber-500/70 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-500 transition-colors disabled:opacity-50"
                    >
                      <AlertTriangle className="h-3 w-3" /> Lost
                    </button>
                    <button
                      onClick={() => promptStolen(c.id)}
                      disabled={isActing}
                      className="flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/20 transition-colors disabled:opacity-50"
                    >
                      <ShieldAlert className="h-3 w-3" /> Stolen
                    </button>
                  </div>
                )}

                {/* Blocked notice */}
                {['blocked','lost','stolen'].includes(c.status) && (
                  <div className="mt-3 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-red-300 border border-red-400/30">
                    Card is {c.status}.
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

      {/* ── Modal: Link Existing Card for Fraud Intelligence ──────────────── */}
      <Modal
        open={isIssuingModal}
        onClose={() => !submittingIssue && setIsIssuingModal(false)}
        title="Link Existing Card for Fraud Protection"
        size="md"
      >
        <form onSubmit={handleIssueCard} className="space-y-4">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-3 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
            <p className="font-semibold flex items-center gap-1.5 mb-1 text-emerald-800 dark:text-emerald-300">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              AI Fraud Shield Card Linkage
            </p>
            <p className="text-[11px] leading-relaxed">
              Link your existing bank-issued card to BankShield's continuous ML monitoring engine to protect against unauthorized swipes, foreign transaction velocity spikes, and high-risk merchant fraud.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Select Linked Bank Account
            </label>
            <Select
              value={issueForm.accountId}
              onChange={(e) => setIssueForm(f => ({ ...f, accountId: e.target.value }))}
              required
            >
              {accounts.filter(a => a.status === 'active').map(a => (
                <option key={a.id} value={a.id}>
                  {a.bank_name ? `${a.bank_name} — ` : ''}{a.account_number} ({a.account_type?.toUpperCase()} • ₹{parseFloat(a.balance ?? 0).toLocaleString('en-IN')})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Card Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CARD_TYPE_OPTIONS.map(ct => (
                <label
                  key={ct.value}
                  className={`flex flex-col justify-between rounded-lg border p-2.5 cursor-pointer transition ${
                    issueForm.cardType === ct.value
                      ? 'border-blue-500 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/30'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{CARD_ICON[ct.value]}</span>
                    <input
                      type="radio"
                      name="cardType"
                      value={ct.value}
                      checked={issueForm.cardType === ct.value}
                      onChange={(e) => setIssueForm(f => ({ ...f, cardType: e.target.value }))}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                  <div className="mt-1">
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">{ct.label}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">{ct.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Card Network
              </label>
              <Select
                value={issueForm.network}
                onChange={(e) => setIssueForm(f => ({ ...f, network: e.target.value }))}
              >
                {NETWORK_OPTIONS.map(n => (
                  <option key={n.value} value={n.value}>{n.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Last 4 Digits of Card
              </label>
              <input
                type="text"
                maxLength={4}
                pattern="\d{4}"
                placeholder="e.g. 4892"
                value={issueForm.lastFour}
                onChange={(e) => setIssueForm(f => ({ ...f, lastFour: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Expiry Month
              </label>
              <Select
                value={issueForm.expiryMonth}
                onChange={(e) => setIssueForm(f => ({ ...f, expiryMonth: e.target.value }))}
              >
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Expiry Year
              </label>
              <Select
                value={issueForm.expiryYear}
                onChange={(e) => setIssueForm(f => ({ ...f, expiryYear: e.target.value }))}
              >
                {Array.from({ length: 11 }, (_, i) => String(new Date().getFullYear() + i)).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button
              type="button"
              variant="outline"
              disabled={submittingIssue}
              onClick={() => setIsIssuingModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submittingIssue || !issueForm.accountId}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {submittingIssue ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Linking Card…
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Link Card for Fraud Analysis
                </>
              )}
            </Button>
          </div>
        </form>
      </Modal>

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

      {/* ── Security OTP Verification for Card Removal ────────────────────── */}
      <SecurityOtpModal
        open={showOtpModal}
        onClose={() => {
          setShowOtpModal(false);
          setOtpCard(null);
        }}
        onVerified={handleVerifiedRemove}
        purpose="card_removal"
        title="Verify Card Deletion"
        description={`To securely remove and deactivate card ${otpCard?.maskedPan || ''}, please enter the 6-digit one-time code sent to your registered email.`}
        actionButtonText="Authorize Card Removal"
      />
    </div>
  );
};

export default MyCards;
