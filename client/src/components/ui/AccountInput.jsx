/**
 * AccountInput.jsx — Smart account field.
 *
 * Accepts either:
 *   a) A UUID v4 directly (passed through unchanged)
 *   b) An account number like ACC-20261003-10000017
 *      → resolves to UUID via GET /api/accounts?search=<number>
 *
 * Props
 * ─────
 *   value        string            controlled value (UUID or acc number)
 *   onChange     (uuid: string) => void   called with the resolved UUID
 *   onError      (msg: string|null) => void  validation/lookup error
 *   placeholder  string
 *   disabled     boolean
 *   className    string
 *   label        string            shown above the field
 *   required     boolean
 *   error        string | undefined  form-level error message (from RHF)
 *
 * State machine
 * ─────────────
 *   idle      → user is typing
 *   resolving → API call in flight (shows spinner)
 *   resolved  → UUID found, green tick + account number shown
 *   not_found → search returned empty (red hint)
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Search } from 'lucide-react';
import { accountService } from '@/services/accountService';
import { cn }             from '@/utils/cn';

// UUID v4 regex
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Account number format
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
  const [display,  setDisplay]  = useState(value);   // what the user sees/types
  const [status,   setStatus]   = useState('idle');  // idle | resolving | resolved | not_found
  const [resolved, setResolved] = useState(null);    // { id, account_number, account_type }
  const debounce = useRef(null);

  // Sync display when value prop changes externally (e.g. form reset)
  useEffect(() => {
    if (value === '') { setDisplay(''); setStatus('idle'); setResolved(null); }
  }, [value]);

  const resolve = useCallback(async (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) { onChange?.(''); onError?.(null); setStatus('idle'); setResolved(null); return; }

    // Already a UUID — pass through immediately
    if (UUID_RE.test(trimmed)) {
      onChange?.(trimmed);
      onError?.(null);
      setStatus('resolved');
      setResolved({ id: trimmed, account_number: null });
      return;
    }

    // Looks like an account number — search for it
    if (ACCT_RE.test(trimmed) || trimmed.length >= 4) {
      setStatus('resolving');
      try {
        const res = await accountService.list({ search: trimmed, limit: 5 });
        const accounts = res.data?.data ?? [];
        // Exact match first, then partial
        const match =
          accounts.find(a => a.account_number?.toLowerCase() === trimmed.toLowerCase()) ??
          accounts[0];

        if (match) {
          onChange?.(match.id);
          onError?.(null);
          setStatus('resolved');
          setResolved({ id: match.id, account_number: match.account_number, type: match.account_type });
        } else {
          onChange?.('');
          onError?.(`No account found matching "${trimmed}"`);
          setStatus('not_found');
          setResolved(null);
        }
      } catch {
        onChange?.('');
        onError?.('Account lookup failed — enter UUID directly.');
        setStatus('not_found');
        setResolved(null);
      }
    }
  }, [onChange, onError]);

  const handleChange = (e) => {
    const raw = e.target.value;
    setDisplay(raw);
    setStatus('idle');
    setResolved(null);
    onChange?.('');

    // Debounce lookup 450 ms after last keystroke
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => resolve(raw), 450);
  };

  const handleBlur = () => {
    clearTimeout(debounce.current);
    resolve(display);
  };

  // Trailing icon
  const TrailingIcon = () => {
    if (status === 'resolving')  return <Loader2     className="h-4 w-4 animate-spin text-blue-500" />;
    if (status === 'resolved')   return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === 'not_found')  return <AlertCircle  className="h-4 w-4 text-red-500" />;
    return <Search className="h-4 w-4 text-gray-300" />;
  };

  const hasError = !!error || status === 'not_found';

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
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
            'placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-blue-600',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'dark:bg-gray-800 dark:text-gray-100',
            hasError
              ? 'border-red-400 bg-red-50/30 focus-visible:ring-red-400 dark:border-red-600'
              : status === 'resolved'
              ? 'border-green-400 bg-green-50/20 focus-visible:ring-green-400 dark:border-green-700'
              : 'border-gray-300 bg-white dark:border-gray-700',
            className,
          )}
        />
        <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
          <TrailingIcon />
        </div>
      </div>

      {/* Resolved info row */}
      {status === 'resolved' && resolved?.account_number && (
        <p className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          {resolved.account_number}
          {resolved.type && <span className="capitalize text-gray-400"> · {resolved.type.replace(/_/g, ' ')}</span>}
        </p>
      )}
      {status === 'resolved' && !resolved?.account_number && (
        <p className="text-[11px] text-green-600 dark:text-green-400">✓ UUID accepted</p>
      )}

      {/* Not-found hint */}
      {status === 'not_found' && (
        <p className="text-[11px] text-red-600 dark:text-red-400">
          No account found — check the account number or paste the UUID.
        </p>
      )}

      {/* Form-level error (from RHF) */}
      {error && status !== 'not_found' && (
        <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
};

export default AccountInput;
