/**
 * useTransactions.js — paginated transaction list with URL-synced filters.
 */
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { transactionService } from '@/services/transactionService';

const DEFAULT_LIMIT = 25;

export const useTransactions = (defaultParams = {}) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const getP = (k, def = '') => searchParams.get(k) ?? def;

  const [filters, setFiltersState] = useState({
    accountId  : getP('accountId',  defaultParams.accountId  ?? ''),
    status     : getP('status',     defaultParams.status     ?? ''),
    txnType    : getP('txnType',    defaultParams.txnType    ?? ''),
    channel    : getP('channel',    defaultParams.channel    ?? ''),
    dateFrom   : getP('dateFrom',   defaultParams.dateFrom   ?? ''),
    dateTo     : getP('dateTo',     defaultParams.dateTo     ?? ''),
    isFraud    : getP('isFraud',    ''),
    page       : parseInt(getP('page', '1'), 10),
  });

  const [transactions, setTransactions] = useState([]);
  const [pagination,   setPagination]   = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  const load = useCallback(async (f = filters) => {
    setLoading(true); setError('');
    try {
      const offset = (f.page - 1) * DEFAULT_LIMIT;
      const res = await transactionService.list({
        accountId : f.accountId  || undefined,
        status    : f.status     || undefined,
        txnType   : f.txnType    || undefined,
        channel   : f.channel    || undefined,
        dateFrom  : f.dateFrom   || undefined,
        dateTo    : f.dateTo     || undefined,
        isFraud   : f.isFraud    || undefined,
        limit     : DEFAULT_LIMIT,
        offset,
      });
      setTransactions(res.data?.data    ?? []);
      setPagination(res.data?.pagination ?? null);
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to load transactions.');
    } finally { setLoading(false); }
  }, [filters]); // eslint-disable-line

  const setFilters = useCallback((updates) => {
    const next = { ...filters, ...updates, page: updates.page ?? 1 };
    setFiltersState(next);
    const p = {};
    if (next.accountId) p.accountId = next.accountId;
    if (next.status)    p.status    = next.status;
    if (next.txnType)   p.txnType   = next.txnType;
    if (next.channel)   p.channel   = next.channel;
    if (next.dateFrom)  p.dateFrom  = next.dateFrom;
    if (next.dateTo)    p.dateTo    = next.dateTo;
    if (next.isFraud)   p.isFraud   = next.isFraud;
    if (next.page > 1)  p.page      = String(next.page);
    setSearchParams(p, { replace: true });
  }, [filters, setSearchParams]);

  useEffect(() => { load(filters); }, [filters]); // eslint-disable-line

  return {
    transactions, pagination, loading, error,
    filters, setFilters,
    refetch: () => load(filters),
  };
};

export default useTransactions;
