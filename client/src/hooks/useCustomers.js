/**
 * useCustomers.js — data-fetching hook for paginated customer list.
 * Keeps URL search-params in sync so the list is bookmarkable.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { customerService } from '@/services/customerService';

const DEFAULT_LIMIT = 20;

export const useCustomers = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const getParam = (k, def = '') => searchParams.get(k) ?? def;

  const [filters, setFiltersState] = useState({
    search     : getParam('search'),
    segment    : getParam('segment'),
    riskRating : getParam('riskRating'),
    sortDir    : getParam('sortDir', 'DESC'),
    page       : parseInt(getParam('page', '1'), 10),
  });

  const [data,    setData]    = useState({ data: [], pagination: null });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const abortRef = useRef(null);

  const fetch = useCallback(async (f = filters) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);
    try {
      const offset = (f.page - 1) * DEFAULT_LIMIT;
      const res    = await customerService.list({
        search    : f.search     || undefined,
        segment   : f.segment    || undefined,
        riskRating: f.riskRating || undefined,
        sortDir   : f.sortDir,
        limit     : DEFAULT_LIMIT,
        offset,
      });
      setData(res.data ?? { data: [], pagination: null });
    } catch (err) {
      if (err.name !== 'CanceledError') setError(err?.response?.data?.error ?? 'Failed to load customers.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Sync filters → URL params
  const setFilters = useCallback((updates) => {
    const next = { ...filters, ...updates, page: updates.page ?? 1 };
    setFiltersState(next);
    const p = {};
    if (next.search)     p.search     = next.search;
    if (next.segment)    p.segment    = next.segment;
    if (next.riskRating) p.riskRating = next.riskRating;
    if (next.sortDir !== 'DESC') p.sortDir = next.sortDir;
    if (next.page > 1)   p.page = String(next.page);
    setSearchParams(p, { replace: true });
  }, [filters, setSearchParams]);

  useEffect(() => { fetch(filters); }, [filters]); // eslint-disable-line

  return {
    customers  : data.data ?? [],
    pagination : data.pagination,
    loading,
    error,
    filters,
    setFilters,
    reload: () => fetch(filters),
  };
};

export default useCustomers;
