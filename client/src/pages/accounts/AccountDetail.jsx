/**
 * AccountDetail — /accounts/:id
 * Tabs: Overview · Transaction History · Cards
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Snowflake, Power, XCircle,
  TrendingUp, CreditCard, History, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { accountService } from '@/services/accountService';
import { useAuth }        from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button }         from '@/components/ui/button';
import { StatusBadge }    from '@/components/ui/StatusBadge';
import { InlineLoader }   from '@/components/ui/LoadingOverlay';
import { ErrorMessage }   from '@/components/ui/ErrorMessage';
import { Pagination }     from '@/components/ui/Pagination';
import Modal              from '@/components/ui/Modal';
import CardsList          from '@/pages/cards/CardsList';

const fmtCurrency = (n, cur = 'INR') =>
  new Intl.NumberFormat('en-IN', { style:'currency', currency: cur, maximumFractionDigits:2 }).format(n ?? 0);

const InfoRow = ({ label, value }) => (
  <div className="flex gap-4 border-b border-gray-100 py-2.5 last:border-0 dark:border-gray-800">
    <span className="w-44 shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
    <span className="text-sm text-gray-900 dark:text-gray-200">{value ?? '—'}</span>
  </div>
);

const TABS = ['Overview', 'History', 'Cards'];
const FREEZE_ROLES  = ['super_admin','admin','compliance_officer','branch_manager'];
const CLOSE_ROLES   = ['super_admin','admin'];

const AccountDetail = () => {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const { hasRole }  = useAuth();

  const [account,  setAccount]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [tab,      setTab]      = useState('Overview');

  // History state
  const [history,  setHistory]  = useState([]);
  const [hPag,     setHPag]     = useState(null);
  const [hPage,    setHPage]    = useState(1);
  const [hLoading, setHLoading] = useState(false);

  // Confirm modals
  const [confirm, setConfirm] = useState(null); // { action, label }

  const loadAccount = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await accountService.get(id);
      setAccount(res.data?.account ?? null);
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to load account.');
    } finally { setLoading(false); }
  }, [id]);

  const loadHistory = useCallback(async (pg = 1) => {
    setHLoading(true);
    try {
      const res = await accountService.getHistory(id, { limit: 20, offset: (pg-1)*20 });
      setHistory(res.data?.transactions ?? []);
      setHPag(res.data?.pagination ?? null);
    } catch { /* silent */ } finally { setHLoading(false); }
  }, [id]);

  useEffect(() => { loadAccount(); }, [loadAccount]);
  useEffect(() => { if (tab === 'History') loadHistory(hPage); }, [tab, hPage]); // eslint-disable-line

  const performAction = async () => {
    if (!confirm) return;
    try {
      if (confirm.action === 'freeze')   await accountService.freeze(id);
      if (confirm.action === 'activate') await accountService.activate(id);
      if (confirm.action === 'close')    await accountService.close(id);
      toast.success(`Account ${confirm.action}d.`);
      setConfirm(null);
      loadAccount();
    } catch (e) {
      toast.error(e?.response?.data?.error ?? `${confirm.action} failed.`);
    }
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><InlineLoader /></div>;
  if (error)   return <div className="p-6"><ErrorMessage message={error} /></div>;
  if (!account) return null;

  const a = account;
  const isActive = a.status === 'active';
  const isFrozen = a.status === 'frozen';
  const isClosed = a.status === 'closed';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/accounts')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-mono text-lg font-bold text-gray-900 dark:text-white">
              {a.account_number}
            </h1>
            <p className="text-xs text-gray-500 capitalize dark:text-gray-400">
              {a.account_type?.replace('_',' ')} · {a.customer_first_name} {a.customer_last_name}
            </p>
          </div>
          <StatusBadge value={a.status} />
        </div>

        {!isClosed && (
          <div className="flex flex-wrap gap-2">
            {isActive  && hasRole(FREEZE_ROLES) && (
              <Button size="sm" variant="outline"
                className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400"
                onClick={() => setConfirm({ action:'freeze', label:'Freeze' })}>
                <Snowflake className="h-3.5 w-3.5" /> Freeze
              </Button>
            )}
            {isFrozen  && hasRole(FREEZE_ROLES) && (
              <Button size="sm" variant="outline"
                className="gap-1.5 border-green-400 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400"
                onClick={() => setConfirm({ action:'activate', label:'Activate' })}>
                <Power className="h-3.5 w-3.5" /> Activate
              </Button>
            )}
            {hasRole(CLOSE_ROLES) && (
              <Button size="sm" variant="outline"
                className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                onClick={() => setConfirm({ action:'close', label:'Close' })}>
                <XCircle className="h-3.5 w-3.5" /> Close
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Balance banner */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: 'Balance',           value: fmtCurrency(a.balance, a.currency),           icon: TrendingUp, color: 'text-emerald-600' },
          { label: 'Available Balance', value: fmtCurrency(a.available_balance, a.currency), icon: TrendingUp, color: 'text-blue-600'    },
          { label: 'Currency',          value: a.currency,                                   icon: null,       color: 'text-gray-700'    },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
              <p className={`mt-1 text-2xl font-bold ${color} dark:opacity-90`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            {t === 'History' ? <span className="flex items-center gap-1.5"><History className="h-3.5 w-3.5"/>{t}</span>
           : t === 'Cards'   ? <span className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5"/>{t}</span>
           : t}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'Overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardContent className="pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Account Details</p>
            <InfoRow label="Account Number"  value={a.account_number} />
            <InfoRow label="Account Type"    value={a.account_type?.replace('_',' ')} />
            <InfoRow label="Status"          value={<StatusBadge value={a.status} />} />
            <InfoRow label="Currency"        value={a.currency} />
            <InfoRow label="Opened"          value={a.opened_at ? new Date(a.opened_at).toLocaleDateString() : null} />
            <InfoRow label="Nominee"         value={a.nominee_name} />
            {a.branch_code && <InfoRow label="Branch"   value={`${a.branch_code} — ${a.branch_name}`} />}
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Customer</p>
            <InfoRow label="Name"            value={`${a.customer_first_name} ${a.customer_last_name}`} />
            <InfoRow label="Email"           value={a.customer_email} />
            <InfoRow label="Customer #"      value={a.customer_number} />
            <InfoRow label="Account Type"    value={a.account_type_description} />
            <InfoRow label="Min Balance"     value={a.min_required_balance ? fmtCurrency(a.min_required_balance, a.currency) : null} />
            <InfoRow label="Interest Rate"   value={a.interest_rate ? `${a.interest_rate}%` : null} />
          </CardContent></Card>
        </div>
      )}

      {/* History */}
      {tab === 'History' && (
        <div className="space-y-4">
          {hLoading ? <InlineLoader label="Loading transactions…" /> : (
            <>
              {history.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
                  <History className="h-8 w-8" />
                  <p className="text-sm">No transactions yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900 text-left">
                        {['Ref','Type','Direction','Amount','Status','Channel','Date'].map(h => (
                          <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {history.map(t => (
                        <tr key={t.id} className="bg-white dark:bg-gray-900">
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.transaction_ref}</td>
                          <td className="px-4 py-3 capitalize">{t.txn_type}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold ${t.direction === 'credit' ? 'text-emerald-600' : 'text-red-500'}`}>
                              {t.direction === 'credit' ? '▲ CR' : '▼ DR'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold">{fmtCurrency(t.amount, t.currency)}</td>
                          <td className="px-4 py-3"><StatusBadge value={t.status} /></td>
                          <td className="px-4 py-3 text-gray-500">{t.channel ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-500">{new Date(t.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {hPag && (
                <div className="flex justify-end">
                  <Pagination page={hPag.page} pages={hPag.pages} onPage={p => setHPage(p)} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Cards tab */}
      {tab === 'Cards' && <CardsList accountId={id} />}

      {/* Confirm modal */}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={`${confirm?.label} Account`} size="sm">
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Are you sure you want to <strong>{confirm?.label?.toLowerCase()}</strong> account <code>{a.account_number}</code>?
          {confirm?.action === 'close' && ' Account must have zero balance.'}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant={confirm?.action === 'activate' ? 'default' : 'destructive'} onClick={performAction}>
            {confirm?.label}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default AccountDetail;
