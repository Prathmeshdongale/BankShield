/**
 * AccountList — /accounts index: search, filter, open new account, paginate.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams }   from 'react-router-dom';
import { Building2, Plus, Eye, Snowflake, Power, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

import { accountService }   from '@/services/accountService';
import { useAuth }           from '@/context/AuthContext';
import { Button }            from '@/components/ui/button';
import { Input }             from '@/components/ui/input';
import Select                from '@/components/ui/Select';
import { StatusBadge }       from '@/components/ui/StatusBadge';
import { Pagination }        from '@/components/ui/Pagination';
import { InlineLoader }      from '@/components/ui/LoadingOverlay';
import { ErrorMessage }      from '@/components/ui/ErrorMessage';
import Modal                 from '@/components/ui/Modal';
import { OpenAccountForm }   from './OpenAccountForm';

const ACCOUNT_STATUSES = ['','pending','active','dormant','frozen','closed'];
const ACCOUNT_TYPES    = ['','savings','current','salary','business','fixed_deposit','recurring_deposit','loan'];
const LIMIT = 20;
const WRITE_ROLES = ['super_admin','admin','branch_manager','teller'];

const fmtCurrency = (n, cur = 'INR') =>
  new Intl.NumberFormat('en-IN', { style:'currency', currency: cur, maximumFractionDigits:2 }).format(n ?? 0);

const AccountList = () => {
  const navigate     = useNavigate();
  const { hasRole }  = useAuth();
  const canCreate    = hasRole(WRITE_ROLES);
  const [sp, setSp]  = useSearchParams();

  const [accounts,    setAccounts]    = useState([]);
  const [pagination,  setPagination]  = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [search,      setSearch]      = useState(sp.get('search') ?? '');
  const [status,      setStatus]      = useState(sp.get('status') ?? '');
  const [accountType, setAccountType] = useState(sp.get('accountType') ?? '');
  const [page,        setPage]        = useState(parseInt(sp.get('page') ?? '1', 10));
  const [openModal,   setOpenModal]   = useState(false);

  const load = useCallback(async (pg = page) => {
    setLoading(true); setError('');
    try {
      const res = await accountService.list({
        search:      search      || undefined,
        status:      status      || undefined,
        accountType: accountType || undefined,
        limit: LIMIT,
        offset: (pg - 1) * LIMIT,
      });
      setAccounts(res.data?.data ?? []);
      setPagination(res.data?.pagination ?? null);
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to load accounts.');
    } finally { setLoading(false); }
  }, [search, status, accountType, page]);

  useEffect(() => { load(page); }, [search, status, accountType, page]); // eslint-disable-line

  const changePage = (p) => { setPage(p); setSp({ search, status, accountType, page: String(p) }, { replace: true }); };

  const handleOpen = async (data) => {
    await accountService.open(data);
    toast.success('Account opened.');
    setOpenModal(false);
    load(1);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <Building2 className="h-6 w-6 text-blue-600" /> Accounts
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage bank accounts — open, freeze, activate, close.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setOpenModal(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Open Account
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Input placeholder="Search account number…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
        </div>
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-36">
          {ACCOUNT_STATUSES.map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </Select>
        <Select value={accountType} onChange={e => { setAccountType(e.target.value); setPage(1); }} className="w-36">
          {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t ? t.replace('_',' ') : 'All types'}</option>)}
        </Select>
      </div>

      <ErrorMessage message={error} />

      {loading ? <InlineLoader label="Loading accounts…" /> : (
        <>
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
              <Building2 className="h-10 w-10" />
              <p className="text-sm">No accounts found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900 text-left">
                    {['Account #','Customer','Type','Balance','Status','Branch','Opened',''].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {accounts.map(a => (
                    <tr key={a.id} onClick={() => navigate(`/accounts/${a.id}`)}
                      className="cursor-pointer bg-white hover:bg-blue-50/40 dark:bg-gray-900 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{a.account_number}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {a.customer_first_name} {a.customer_last_name}
                        <p className="text-[11px] text-gray-400">{a.customer_email}</p>
                      </td>
                      <td className="px-4 py-3 capitalize">{a.account_type?.replace('_',' ')}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                        {fmtCurrency(a.balance, a.currency)}
                      </td>
                      <td className="px-4 py-3"><StatusBadge value={a.status} /></td>
                      <td className="px-4 py-3 text-gray-500">{a.branch_code ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {a.opened_at ? new Date(a.opened_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-blue-600"
                          onClick={() => navigate(`/accounts/${a.id}`)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{pagination.total} account{pagination.total !== 1 ? 's' : ''}</span>
              <Pagination page={pagination.page} pages={pagination.pages} onPage={changePage} />
            </div>
          )}
        </>
      )}

      {/* Open Account modal */}
      <Modal open={openModal} onClose={() => setOpenModal(false)} title="Open New Account" size="md">
        <OpenAccountForm onSubmit={handleOpen} onCancel={() => setOpenModal(false)} />
      </Modal>
    </div>
  );
};

export default AccountList;
