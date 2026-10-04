/**
 * MyAccountDetail.jsx — /portal/accounts/:id
 *
 * Customer-facing single account view.
 * Tabs: Overview · Transaction History · Cards
 * Customer cannot freeze/close — those actions are hidden.
 * The "Report Lost/Stolen" and "Block" card actions remain accessible.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link }    from 'react-router-dom';
import {
  ArrowLeft, Building2, CreditCard,
  History, RefreshCw, ChevronRight,
} from 'lucide-react';
import { accountService }    from '@/services/accountService';
import { cardService }       from '@/services/cardService';
import { StatusBadge }       from '@/components/ui/StatusBadge';
import { RiskBadge }         from '@/components/fraud/RiskBadge';
import { Button }            from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Pagination }        from '@/components/ui/Pagination';
import { InlineLoader }      from '@/components/ui/LoadingOverlay';
import { ErrorMessage }      from '@/components/ui/ErrorMessage';
import TransactionDrawer     from '@/pages/transactions/TransactionDrawer';
import toast                 from 'react-hot-toast';

const fmtAmt  = (n, cur = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n ?? 0);
const fmtDate = s =>
  s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const InfoRow = ({ label, value }) => (
  <div className="flex gap-4 border-b border-gray-100 py-2.5 last:border-0 dark:border-gray-800">
    <span className="w-44 shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
    <span className="text-sm text-gray-900 dark:text-gray-200">{value ?? '—'}</span>
  </div>
);

const GRAD = {
  savings          : 'from-blue-600   to-indigo-700',
  current          : 'from-slate-600  to-slate-800',
  salary           : 'from-emerald-600 to-teal-700',
  fixed_deposit    : 'from-amber-600  to-orange-700',
  recurring_deposit: 'from-purple-600 to-violet-700',
  loan             : 'from-red-600    to-rose-700',
  business         : 'from-cyan-600   to-sky-700',
};

const CARD_TYPE_ICONS = { debit: '🏧', credit: '💳', prepaid: '📋', virtual: '🌐' };

// ─────────────────────────────────────────────────────────────────────────────
const MyAccountDetail = () => {
  const { id }    = useParams();
  const [tab,     setTab]     = useState('overview');
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // History
  const [history,   setHistory]  = useState([]);
  const [hPag,      setHPag]     = useState(null);
  const [hPage,     setHPage]    = useState(1);
  const [hLoading,  setHLoading] = useState(false);
  const [selTxn,    setSelTxn]   = useState(null);

  // Cards
  const [cards,     setCards]    = useState([]);
  const [cLoading,  setCLoading] = useState(false);
  const [blocking,  setBlocking] = useState('');

  const loadAccount = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await accountService.get(id);
      setAccount(res.data?.account ?? null);
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to load account.');
    } finally { setLoading(false); }
  }, [id]);

  const loadHistory = useCallback(async (pg = hPage) => {
    if (!id) return;
    setHLoading(true);
    try {
      const res = await accountService.getHistory(id, { limit: 20, offset: (pg - 1) * 20 });
      setHistory(res.data?.data ?? []);
      setHPag(res.data?.pagination ?? null);
    } catch {} finally { setHLoading(false); }
  }, [id, hPage]);

  const loadCards = useCallback(async () => {
    if (!id) return;
    setCLoading(true);
    try {
      const res = await accountService.listCards(id);
      setCards(res.data?.cards ?? []);
    } catch {} finally { setCLoading(false); }
  }, [id]);

  useEffect(() => { loadAccount(); }, [loadAccount]);
  useEffect(() => { if (tab === 'history') loadHistory(hPage); }, [tab, hPage]); // eslint-disable-line
  useEffect(() => { if (tab === 'cards')   loadCards(); }, [tab, loadCards]);

  const handleBlock = async (cardId) => {
    setBlocking(cardId);
    try {
      await cardService.block(cardId, 'Blocked by cardholder');
      toast.success('Card blocked.');
      loadCards();
    } catch (e) { toast.error(e?.response?.data?.error ?? 'Failed to block card.'); }
    finally { setBlocking(''); }
  };

  const handleReportLost = async (cardId) => {
    setBlocking(cardId);
    try {
      await cardService.reportLost(cardId);
      toast.success('Card reported as lost.');
      loadCards();
    } catch (e) { toast.error(e?.response?.data?.error ?? 'Failed.'); }
    finally { setBlocking(''); }
  };

  if (loading) return <InlineLoader label="Loading account…" />;
  if (error)   return <ErrorMessage message={error} />;
  if (!account) return null;

  const grad = GRAD[account.account_type] ?? 'from-gray-600 to-gray-800';

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Back + hero card ──────────────────────────────────────────────── */}
      <Link to="/portal/accounts"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
        <ArrowLeft className="h-4 w-4" /> Back to accounts
      </Link>

      <div className={`rounded-2xl bg-gradient-to-br ${grad} p-6 text-white shadow-lg`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest opacity-70">
              {account.account_type?.replace(/_/g, ' ')}
            </p>
            <p className="font-mono text-sm opacity-60 mt-0.5">{account.account_number}</p>
          </div>
          <StatusBadge value={account.status}
            className="border-white/30 bg-white/20 text-white" />
        </div>
        <p className="mt-5 text-3xl font-bold tracking-tight">
          {fmtAmt(account.balance, account.currency)}
        </p>
        <p className="mt-1 text-sm opacity-60">Available Balance</p>
        <div className="mt-4 flex gap-4 text-xs opacity-60 border-t border-white/20 pt-3">
          {account.branch_name && <span>Branch: {account.branch_name}</span>}
          <span>Opened: {fmtDate(account.opened_at)}</span>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        {[
          { id: 'overview', label: 'Overview',    Icon: Building2   },
          { id: 'history',  label: 'History',     Icon: History     },
          { id: 'cards',    label: 'Cards',       Icon: CreditCard  },
        ].map(({ id: tid, label, Icon }) => (
          <button key={tid} onClick={() => setTab(tid)}
            className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === tid
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ─────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <Card>
          <CardContent className="py-4">
            <InfoRow label="Account Number"  value={account.account_number} />
            <InfoRow label="Account Type"    value={account.account_type?.replace(/_/g, ' ')} />
            <InfoRow label="Status"          value={<StatusBadge value={account.status} />} />
            <InfoRow label="Balance"         value={fmtAmt(account.balance, account.currency)} />
            <InfoRow label="Currency"        value={account.currency} />
            <InfoRow label="Branch"          value={account.branch_name ?? account.branch_code} />
            <InfoRow label="Opened"          value={fmtDate(account.opened_at)} />
            {account.interest_rate != null && (
              <InfoRow label="Interest Rate" value={`${account.interest_rate}% p.a.`} />
            )}
            {account.min_balance != null && (
              <InfoRow label="Min Balance"   value={fmtAmt(account.min_balance, account.currency)} />
            )}
          </CardContent>
        </Card>
      )}

      {/* ── History tab ──────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="space-y-4">
          {hLoading ? <InlineLoader label="Loading transactions…" /> : (
            <>
              {history.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
                  <History className="h-8 w-8" />
                  <p className="text-sm">No transactions yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900 text-left">
                        {['Ref', 'Type', 'Amount', 'Channel', 'Status', 'Risk', 'Date'].map(h => (
                          <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {history.map(t => (
                        <tr key={t.id}
                          onClick={() => setSelTxn(t)}
                          className="cursor-pointer bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/60">
                          <td className="px-4 py-3 font-mono text-[11px] text-gray-500">{t.transaction_ref}</td>
                          <td className="px-4 py-3 capitalize">{t.txn_type}</td>
                          <td className="px-4 py-3 font-semibold">{fmtAmt(t.amount, t.currency)}</td>
                          <td className="px-4 py-3 text-gray-500">{t.channel ?? '—'}</td>
                          <td className="px-4 py-3"><StatusBadge value={t.status} /></td>
                          <td className="px-4 py-3"><RiskBadge score={t.risk_score} /></td>
                          <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(t.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {hPag && (
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>{hPag.total} transaction{hPag.total !== 1 ? 's' : ''}</span>
                  <Pagination page={hPag.page} pages={hPag.pages} onPage={p => { setHPage(p); loadHistory(p); }} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Cards tab ────────────────────────────────────────────────────── */}
      {tab === 'cards' && (
        <div className="space-y-4">
          {cLoading ? <InlineLoader label="Loading cards…" /> : (
            cards.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
                <CreditCard className="h-8 w-8" />
                <p className="text-sm">No cards on this account.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {cards.map(c => (
                  <div key={c.id}
                    className="rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-800 to-gray-900 p-5 text-white shadow-md dark:border-gray-700">
                    <div className="flex items-center justify-between mb-5">
                      <span className="text-xl">{CARD_TYPE_ICONS[c.card_type] ?? '💳'}</span>
                      <StatusBadge value={c.status}
                        className="border-white/30 bg-white/20 text-white text-[10px]" />
                    </div>
                    <p className="font-mono text-sm tracking-widest text-gray-200">{c.masked_number}</p>
                    <div className="mt-4 flex items-end justify-between">
                      <div>
                        <p className="text-[10px] uppercase text-gray-400">Expires</p>
                        <p className="text-sm">{String(c.expiry_month).padStart(2,'0')}/{c.expiry_year}</p>
                      </div>
                      <span className="text-xs font-bold uppercase text-gray-300">{c.network}</span>
                    </div>
                    {/* Actions — only for active cards */}
                    {c.status === 'active' && (
                      <div className="mt-4 flex gap-2 border-t border-white/20 pt-3">
                        <button
                          onClick={() => handleBlock(c.id)}
                          disabled={blocking === c.id}
                          className="rounded-lg bg-red-500/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 transition-colors disabled:opacity-50">
                          {blocking === c.id ? 'Blocking…' : 'Block Card'}
                        </button>
                        <button
                          onClick={() => handleReportLost(c.id)}
                          disabled={blocking === c.id}
                          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition-colors disabled:opacity-50">
                          Report Lost
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* Transaction drawer */}
      <TransactionDrawer txn={selTxn} onClose={() => setSelTxn(null)} />
    </div>
  );
};

export default MyAccountDetail;
