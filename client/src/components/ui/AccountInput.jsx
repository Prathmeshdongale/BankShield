/**
 * AccountInput.jsx — Smart account field.
 * Accepts UUID or account number (ACC-…), resolves to UUID via API lookup.
 * Full dark-mode support.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Search } from 'lucide-react';
import { accountService } from '@/services/accountService';
import { cn }             from '@/utils/cn';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCT_RE = /^ACC-\d{8}-\d+$/i;

const AccountInput = ({
  value       = '',
  onChange,
  onError,
  placeholder = 'UUID or account number (ACC-…)',
  disabled    = false,
  className   = '',
  label,
  required    = false,
  error,
}) => {
  const [display,  setDisplay]  = useState(value);
  const [status,   setStatus]   = useState('idle');
  const [resolved, setResolved] = useState(null);
  const debounce = useRef(null);

  useEffect(() => {
    if (value === '') { setDisplay(''); setStatus('idle'); setResolved(null); }
  }, [value]);

  const resolve = useCallback(async (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) { onChange?.(''); onError?.(null); setStatus('idle'); setResolved(null); return; }

    if (UUID_RE.test(trimmed)) {
      onChange?.(trimmed); onError?.(null);
      setStatus('resolved'); setResolved({ id: trimmed, account_number: null });
      return;
    }

    if (ACCT_RE.test(trimmed) || trimmed.length >= 4) {
      setStatus('resolving');
      try {
        const res  = await accountService.list({ search: trimmed, limit: 5 });
        const accounts = res.data?.data ?? [];
        const match =
          accounts.find(a => a.account_number?.toLowerCase() === trimmed.toLowerCase()) ??
          accounts[0];
        if (match) {
          onChange?.(match.id); onError?.(null);
          setStatus('resolved');
          setResolved({ id: match.id, account_number: match.account_number, type: match.account_type });
        } else {
          onChange?.(''); onError?.(`No account found matching "${trimmed}"`);
          setStatus('not_found'); setResolved(null);
        }
      } catch {
        onChange?.(''); onError?.('Account lookup failed — enter UUID directly.');
        setStatus('not_found'); setResolved(null);
      }
    }
  }, [onChange, onError]);

  const handleChange = (e) => {
    const raw = e.target.value;
    setDisplay(raw); setStatus('idle'); setResolved(null); onChange?.('');
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => resolve(raw), 450);
  };

  const handleBlur = () => { clearTimeout(debounce.current); resolve(display); };

  const TrailingIcon = () => {
    if (status === 'resolving')  return <Loader2      className="h-4 w-4 animate-spin text-blue-500" />;
    if (status === 'resolved')   return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === 'not_found')  return <AlertCircle  className="h-4 w-4 text-red-500" />;
    return <Search className="h-4 w-4 text-slate-300 dark:text-slate-600" />;
  };

  const hasError = !!error || status === 'not_found';

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          {label}{required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}

      <div className="relative">
        <input
          type="text"
          value={display}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            'flex h-10 w-full rounded-md border px-3 py-2 pr-9 text-sm shadow-sm',
            'outline-none transition-colors',
            'placeholder:text-slate-400 dark:placeholder:text-slate-600',
            'focus-visible:ring-2 focus-visible:ring-offset-0',
            'disabled:cursor-not-allowed disabled:opacity-50',
            hasError
              ? [
                  'border-red-400 bg-red-50/40 focus-visible:ring-red-400',
                  'dark:border-red-700 dark:bg-red-950/20 dark:focus-visible:ring-red-600',
                ]
              : status === 'resolved'
              ? [
                  'border-green-400 bg-green-50/30 focus-visible:ring-green-400',
                  'dark:border-green-700 dark:bg-green-950/20 dark:focus-visible:ring-green-600',
                ]
              : [
                  'border-slate-300 bg-white text-slate-900 focus-visible:ring-blue-500',
                  'dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus-visible:ring-blue-400',
                ],
            className,
          )}
        />
        <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
          <TrailingIcon />
        </div>
      </div>

      {status === 'resolved' && resolved?.account_number && (
        <p className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          {resolved.account_number}
          {resolved.type && (
            <span className="capitalize text-slate-400"> · {resolved.type.replace(/_/g, ' ')}</span>
          )}
        </p>
      )}
      {status === 'resolved' && !resolved?.account_number && (
        <p className="text-[11px] text-green-600 dark:text-green-400">✓ UUID accepted</p>
      )}
      {status === 'not_found' && (
        <p className="text-[11px] text-red-600 dark:text-red-400">
          No account found — check the account number or paste the UUID.
        </p>
      )}
      {error && status !== 'not_found' && (
        <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
};

export default AccountInput;
