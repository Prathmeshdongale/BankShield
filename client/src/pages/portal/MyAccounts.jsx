/**
 * MyAccounts.jsx — /portal/accounts
 *
 * Customer view of their own bank accounts.
 * Server-side JWT scoping ensures only this customer's accounts are returned.
 *
 * Features:
 *   • Account cards with balance, type, status, account number
 *   • Open new account (Savings, Current, Salary, Business)
 *   • Close / remove account with balance settlement
 *   • Click-through to account detail (/portal/accounts/:id)
 *   • Status filter + refresh
 *   • Loading / empty / error states
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, RefreshCw, ChevronRight, TrendingUp, Plus,
  AlertTriangle, XCircle, CheckCircle2, Shield
} from 'lucide-react';
import toast from 'react-hot-toast';
import { accountService } from '@/services/accountService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InlineLoader } from '@/components/ui/LoadingOverlay';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import Modal from '@/components/ui/Modal';

const STATUSES = ['', 'active', 'dormant', 'frozen', 'closed', 'pending'];

const fmtAmt = (n, cur = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n ?? 0);
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—';

// gradient per account type
const GRAD = {
  savings          : 'from-blue-600 to-indigo-700',
  current          : 'from-slate-700 to-slate-900',
  salary           : 'from-emerald-600 to-teal-700',
  fixed_deposit    : 'from-amber-600 to-orange-700',
  recurring_deposit: 'from-purple-600 to-violet-700',
  loan             : 'from-red-600 to-rose-700',
  business         : 'from-cyan-700 to-sky-900',
};

const OPENABLE_ACCOUNT_TYPES = [
  { value: 'savings',  label: 'Savings Account',  desc: 'Standard interest-earning everyday savings account' },
  { value: 'current',  label: 'Current Account',  desc: 'Operational account with unlimited daily transactions' },
  { value: 'salary',   label: 'Salary Account',   desc: 'Zero-balance salaried payroll account' },
  { value: 'business', label: 'Business Account', desc: 'Commercial banking account for business operations' },
];

const CURRENCIES = [
  { value: 'INR', label: 'INR (₹) - Indian Rupee' },
  { value: 'USD', label: 'USD ($) - US Dollar' },
  { value: 'EUR', label: 'EUR (€) - Euro' },
  { value: 'GBP', label: 'GBP (£) - British Pound' },
];

const MyAccounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [status,   setStatus]   = useState('');

  // Open account modal state
  const [isOpeningModal, setIsOpeningModal] = useState(false);
  const [submittingOpen, setSubmittingOpen] = useState(false);
  const [openForm, setOpenForm] = useState({
    accountType: 'savings',
    currency: 'INR',
    nomineeName: '',
  });

  // Close account modal state
  const [accountToClose, setAccountToClose] = useState(null);
  const [closing,        setClosing]        = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await accountService.list({
        status: status || undefined,
        limit: 50,
      });
      setAccounts(res.data?.data ?? []);
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to load accounts.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  // Handle open account
  const handleOpenAccount = async (e) => {
    e.preventDefault();
    setSubmittingOpen(true);
    try {
      await accountService.open({
        accountType: openForm.accountType,
        currency: openForm.currency,
        nomineeName: openForm.nomineeName?.trim() || undefined,
      });
      toast.success('New account opened successfully!');
      setIsOpeningModal(false);
      setOpenForm({ accountType: 'savings', currency: 'INR', nomineeName: '' });
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.error ?? 'Failed to open account.');
    } finally {
      setSubmittingOpen(false);
    }
  };

  // Handle close account
  const handleConfirmClose = async () => {
    if (!accountToClose) return;
    setClosing(true);
    try {
      await accountService.close(accountToClose.id, { zeroBalance: true });
      toast.success(`Account ${accountToClose.account_number} closed successfully.`);
      setAccountToClose(null);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.error ?? 'Failed to close account.');
    } finally {
      setClosing(false);
    }
  };

  // Total across active accounts
  const totalBalance = accounts
    .filter(a => a.status === 'active')
    .reduce((sum, a) => sum + parseFloat(a.balance ?? 0), 0);

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <Building2 className="h-6 w-6 text-blue-600" /> My Accounts
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage your bank accounts, review balances, and open or close accounts.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            onClick={() => setIsOpeningModal(true)}
            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
            size="sm"
          >
            <Plus className="h-4 w-4" /> Open New Account
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Total balance banner ─────────────────────────────────────────── */}
      {!loading && accounts.length > 0 && (
        <div className="flex items-center gap-4 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4 dark:border-blue-900 dark:from-blue-950/40 dark:to-indigo-950/40">
          <TrendingUp className="h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Total Active Balance</p>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {fmtAmt(totalBalance)}
            </p>
          </div>
        </div>
      )}

      {/* ── Filter ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Select value={status} onChange={e => setStatus(e.target.value)} className="w-40">
          {STATUSES.map(s => (
            <option key={s} value={s}>{s || 'All statuses'}</option>
          ))}
        </Select>
      </div>

      <ErrorMessage message={error} />

      {/* ── Cards ───────────────────────────────────────────────────────── */}
      {loading ? (
        <InlineLoader label="Loading your accounts…" />
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 py-16 text-gray-400 dark:border-gray-700">
          <Building2 className="h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm">
            {status ? `No ${status} accounts found.` : 'No active bank accounts found.'}
          </p>
          <Button
            size="sm"
            onClick={() => setIsOpeningModal(true)}
            className="mt-2 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4" /> Open Your First Account
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map(a => {
            const grad = GRAD[a.account_type] ?? 'from-gray-600 to-gray-800';
            const isClosed = a.status === 'closed';

            return (
              <div
                key={a.id}
                className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br ${grad} p-5 text-white shadow-md hover:shadow-xl transition-all duration-200 ${isClosed ? 'opacity-70 grayscale-[20%]' : ''}`}
              >
                {/* Top row */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-widest opacity-75 font-medium">
                      {a.account_type?.replace(/_/g, ' ')}
                    </p>
                    <p className="font-mono text-xs opacity-70 mt-0.5">{a.account_number}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge
                      value={a.status}
                      className="border-white/30 bg-white/20 text-white text-[10px]"
                    />
                  </div>
                </div>

                {/* Balance */}
                <div className="mt-6">
                  <p className="text-xs opacity-65 uppercase tracking-wide">Available Balance</p>
                  <p className="text-2xl font-bold tracking-tight">
                    {fmtAmt(a.balance, a.currency)}
                  </p>
                </div>

                {/* Bottom actions & meta */}
                <div className="mt-4 flex items-center justify-between border-t border-white/20 pt-3 text-xs">
                  <div>
                    <p className="opacity-65">Opened {fmtDate(a.opened_at)}</p>
                    {a.nominee_name && (
                      <p className="opacity-65 text-[10px] mt-0.5 truncate max-w-[130px]">
                        Nominee: {a.nominee_name}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {a.status === 'active' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setAccountToClose(a);
                        }}
                        className="rounded-md bg-white/10 hover:bg-rose-500/80 px-2 py-1 text-[11px] font-medium text-white transition backdrop-blur-sm"
                        title="Close / settle account"
                      >
                        Close
                      </button>
                    )}
                    <Link
                      to={`/portal/accounts/${a.id}`}
                      className="inline-flex items-center gap-0.5 rounded-md bg-white/20 hover:bg-white/30 px-2 py-1 text-[11px] font-medium text-white transition"
                    >
                      <span>Details</span>
                      <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: Open New Account ───────────────────────────────────────── */}
      <Modal
        open={isOpeningModal}
        onClose={() => !submittingOpen && setIsOpeningModal(false)}
        title="Open a New Bank Account"
        size="md"
      >
        <form onSubmit={handleOpenAccount} className="space-y-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
            <p className="font-semibold flex items-center gap-1.5 mb-1">
              <Shield className="h-4 w-4 text-blue-600" />
              Instant Account Creation
            </p>
            <p className="text-[11px] leading-relaxed">
              Select your preferred account type and currency. Your new account number will be generated immediately and linked to your security profile.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Account Type
            </label>
            <div className="space-y-2">
              {OPENABLE_ACCOUNT_TYPES.map(t => (
                <label
                  key={t.value}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                    openForm.accountType === t.value
                      ? 'border-blue-500 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/30'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="accountType"
                    value={t.value}
                    checked={openForm.accountType === t.value}
                    onChange={(e) => setOpenForm(f => ({ ...f, accountType: e.target.value }))}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">{t.label}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{t.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Currency
              </label>
              <Select
                value={openForm.currency}
                onChange={(e) => setOpenForm(f => ({ ...f, currency: e.target.value }))}
              >
                {CURRENCIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Nominee Name (Optional)
              </label>
              <Input
                placeholder="e.g. Jane Doe"
                value={openForm.nomineeName}
                onChange={(e) => setOpenForm(f => ({ ...f, nomineeName: e.target.value }))}
                maxLength={100}
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button
              type="button"
              variant="outline"
              disabled={submittingOpen}
              onClick={() => setIsOpeningModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submittingOpen}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submittingOpen && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {submittingOpen ? 'Creating Account…' : 'Open Account Now'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Confirm Close Account ──────────────────────────────────── */}
      {accountToClose && (
        <Modal
          open={Boolean(accountToClose)}
          onClose={() => !closing && setAccountToClose(null)}
          title="Close Account Confirmation"
          size="sm"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
              <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
              <div>
                <p className="font-semibold">Closing Account {accountToClose.account_number}</p>
                <p className="text-[11px] mt-0.5 text-rose-800 dark:text-rose-300">
                  This action will settle any remaining balance of{' '}
                  <strong>{fmtAmt(accountToClose.balance, accountToClose.currency)}</strong> and permanently mark the account as closed.
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-600 dark:text-gray-400">
              Are you sure you want to close this <strong>{accountToClose.account_type?.replace(/_/g, ' ')}</strong>? You can open a new account anytime.
            </p>

            <div className="mt-5 flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                disabled={closing}
                onClick={() => setAccountToClose(null)}
              >
                Keep Account
              </Button>
              <Button
                onClick={handleConfirmClose}
                disabled={closing}
                className="gap-2 bg-rose-600 hover:bg-rose-700 text-white"
              >
                {closing && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                {closing ? 'Closing Account…' : 'Confirm & Close Account'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
};

export default MyAccounts;
