/**
 * MakeTransactionForm — full "make a transaction" form.
 * Supports: deposit, withdraw, transfer, card-payment, UPI, ATM, online.
 *
 * Validation strategy:
 *   • Per-type Zod schemas enforce required UUIDs and amounts at submission.
 *   • The `clean()` helper strips undefined/null/empty strings before POST.
 *   • Server 422 errors are surfaced in the top-level error banner.
 */
import React, { useState, useCallback } from 'react';
import { useNavigate }   from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver }   from '@hookform/resolvers/zod';
import { z }             from 'zod';
import {
  ArrowLeftRight, Loader2, CheckCircle2, AlertTriangle,
  Building2, CreditCard, Smartphone, Globe, Landmark,
} from 'lucide-react';
import toast                   from 'react-hot-toast';
import { transactionService }  from '@/services/transactionService';
import AccountInput            from '@/components/ui/AccountInput';
import { Input }               from '@/components/ui/input';
import Select                  from '@/components/ui/Select';
import { Button }              from '@/components/ui/button';
import { FieldError, ErrorMessage } from '@/components/ui/ErrorMessage';
import { StatusBadge }         from '@/components/ui/StatusBadge';
import { cn }                  from '@/utils/cn';

// ── Transaction types ─────────────────────────────────────────────────────────
const TYPES = [
  { id: 'deposit',      label: 'Deposit',           icon: Building2,      desc: 'Credit funds from external source (branch, NEFT, RTGS)' },
  { id: 'withdraw',     label: 'Withdrawal',         icon: Landmark,       desc: 'Cash withdrawal from account (branch or ATM)' },
  { id: 'transfer',     label: 'Fund Transfer',      icon: ArrowLeftRight, desc: 'Move funds between accounts (web, UPI, NEFT…)' },
  { id: 'card-payment', label: 'Card Payment (POS)', icon: CreditCard,     desc: 'Point-of-sale card payment' },
  { id: 'upi',          label: 'UPI Payment',        icon: Smartphone,     desc: 'Unified Payment Interface transfer' },
  { id: 'atm',          label: 'ATM Withdrawal',     icon: Landmark,       desc: 'ATM cash withdrawal (card required)' },
  { id: 'online',       label: 'Online Payment',     icon: Globe,          desc: 'Web / mobile card payment' },
];

// ── Shared field definitions ───────────────────────────────────────────────────
const amountField   = z.coerce.number({ invalid_type_error: 'Amount must be a number.' }).min(0.01, 'Amount must be > 0');
const uuidField     = (label) => z.string().trim().uuid(`${label} must be a valid UUID.`);
const optUuidField  = (label) => z.string().trim().uuid(`${label} must be a valid UUID.`).optional().or(z.literal(''));
const optStrField   = z.string().trim().optional().or(z.literal(''));
const currencyField = z.string().trim().length(3, 'Currency must be a 3-letter code.').optional().default('INR');
const idemField     = z.string().trim().min(1).max(128).optional().or(z.literal(''));

// ── Per-type Zod schemas (only required fields enforced) ──────────────────────
const SCHEMAS = {
  deposit: z.object({
    accountId     : uuidField('Account ID'),
    amount        : amountField,
    currency      : currencyField,
    channel       : z.string().optional(),
    description   : optStrField,
    idempotencyKey: idemField,
  }),
  withdraw: z.object({
    accountId     : uuidField('Account ID'),
    amount        : amountField,
    currency      : currencyField,
    channel       : z.string().optional(),
    cardId        : optUuidField('Card ID'),
    description   : optStrField,
    idempotencyKey: idemField,
  }),
  transfer: z.object({
    sourceAccountId     : uuidField('Source Account ID'),
    destinationAccountId: uuidField('Destination Account ID'),
    amount              : amountField,
    currency            : currencyField,
    channel             : z.string().optional(),
    description         : optStrField,
    idempotencyKey      : idemField,
  }).refine(d => d.sourceAccountId !== d.destinationAccountId, {
    message: 'Source and destination accounts must differ.',
    path   : ['destinationAccountId'],
  }),
  'card-payment': z.object({
    accountId       : uuidField('Account ID'),
    cardId          : uuidField('Card ID'),
    amount          : amountField,
    currency        : currencyField,
    channel         : z.string().optional(),
    merchantName    : optStrField,
    merchantCategory: optStrField,
    description     : optStrField,
    idempotencyKey  : idemField,
  }),
  upi: z.object({
    sourceAccountId     : uuidField('Source Account ID'),
    destinationAccountId: optUuidField('Destination Account ID'),
    amount              : amountField,
    currency            : currencyField,
    upiVpa              : optStrField,
    description         : optStrField,
    idempotencyKey      : idemField,
  }),
  atm: z.object({
    accountId     : uuidField('Account ID'),
    cardId        : uuidField('Card ID'),
    amount        : amountField,
    currency      : currencyField,
    locationCity  : optStrField,
    idempotencyKey: idemField,
  }),
  online: z.object({
    accountId       : uuidField('Account ID'),
    cardId          : uuidField('Card ID'),
    amount          : amountField,
    currency        : currencyField,
    channel         : z.string().optional(),
    merchantName    : optStrField,
    merchantCategory: optStrField,
    description     : optStrField,
    idempotencyKey  : idemField,
  }),
};

// Strip undefined / null / empty strings from payload before sending
const clean = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== '' && v != null)
  );

// ── Field wrapper ─────────────────────────────────────────────────────────────
const F = ({ label, required, error, children, hint }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
      {label}{required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
    {children}
    {hint  && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
    <FieldError message={error?.message} />
  </div>
);

// ── Result card ───────────────────────────────────────────────────────────────
const ResultCard = ({ result, onReset }) => {
  const txn   = result.transaction;
  const fraud = result.fraud;
  const risk  = parseFloat(fraud?.riskScore ?? 0) * 100;
  const color = risk >= 80 ? 'text-red-600' : risk >= 60 ? 'text-orange-500' : risk >= 30 ? 'text-yellow-500' : 'text-green-600';

  return (
    <div className={cn(
      'rounded-2xl border p-6 space-y-4',
      txn.status === 'completed' ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/20'
        : txn.status === 'blocked' ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/20'
        : 'border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/20'
    )}>
      <div className="flex items-center gap-3">
        {txn.status === 'completed'
          ? <CheckCircle2 className="h-8 w-8 text-green-600" />
          : <AlertTriangle className="h-8 w-8 text-orange-500" />}
        <div>
          <p className="text-base font-bold text-gray-900 dark:text-white capitalize">
            Transaction {txn.status}
          </p>
          <p className="font-mono text-xs text-gray-500">{txn.transaction_ref}</p>
        </div>
        <div className="ml-auto"><StatusBadge value={txn.status} /></div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {[
          ['Amount',     `${txn.currency} ${parseFloat(txn.amount).toFixed(2)}`],
          ['Channel',    txn.channel],
          ['Type',       txn.txn_type],
          ['Risk Score', fraud ? <span className={`font-bold ${color}`}>{risk.toFixed(1)}%</span> : '—'],
          ['Risk Level', fraud?.riskLevel && <StatusBadge value={fraud.riskLevel.toLowerCase()} />],
          ['Decision',   fraud?.decision && (
            <span className={`font-semibold ${
              fraud.decision === 'APPROVE' ? 'text-green-600' :
              fraud.decision === 'BLOCK'   ? 'text-red-600'   : 'text-yellow-600'
            }`}>{fraud.decision}</span>
          )],
        ].map(([l, v]) => v && (
          <div key={l}>
            <p className="text-xs text-gray-400">{l}</p>
            <p className="font-medium text-gray-800 dark:text-gray-200">{v}</p>
          </div>
        ))}
      </div>

      {fraud?.alertId && (
        <div className="rounded-lg border border-orange-200 bg-orange-100/60 px-3 py-2 text-xs text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-400">
          ⚠ Fraud alert created — review in Fraud Alerts queue.
        </div>
      )}

      {/* SHAP top feature (if available) */}
      {fraud?.shapValues?.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-800">
          <p className="font-medium text-gray-600 dark:text-gray-400 mb-1">
            Top risk factor:
          </p>
          <p className="font-mono text-gray-800 dark:text-gray-200">
            {fraud.shapValues[0].feature.replace(/_/g, ' ')}
            <span className={`ml-2 font-bold ${fraud.shapValues[0].shap >= 0 ? 'text-red-600' : 'text-green-600'}`}>
              SHAP {fraud.shapValues[0].shap >= 0 ? '+' : ''}{fraud.shapValues[0].shap.toFixed(4)}
            </span>
          </p>
        </div>
      )}

      <Button onClick={onReset} variant="outline" className="w-full">
        Make Another Transaction
      </Button>
    </div>
  );
};

// ── Channel options per type ──────────────────────────────────────────────────
const CHANNEL_OPTIONS = {
  deposit      : ['branch', 'neft', 'rtgs', 'imps', 'api'],
  withdraw     : ['branch', 'atm', 'api'],
  transfer     : ['web', 'mobile', 'upi', 'neft', 'rtgs', 'imps', 'branch', 'api'],
  'card-payment': ['pos', 'web', 'mobile', 'atm', 'upi', 'api'],
  online       : ['web', 'mobile'],
};

// ── Which fields to show per type ─────────────────────────────────────────────
const SHOW = {
  accountId      : new Set(['deposit', 'withdraw', 'card-payment', 'atm', 'online']),
  sourceAccountId: new Set(['transfer', 'upi']),
  destAccountId  : new Set(['transfer', 'upi']),
  cardId         : new Set(['card-payment', 'atm', 'online']),
  channel        : new Set(['deposit', 'withdraw', 'transfer', 'card-payment', 'online']),
  upiVpa         : new Set(['upi']),
  merchant       : new Set(['card-payment', 'online']),
  locationCity   : new Set(['atm']),
};

// ── MakeTransactionForm ───────────────────────────────────────────────────────
const MakeTransactionForm = () => {
  const navigate    = useNavigate();
  const [txnType,   setTxnType]   = useState('transfer');
  const [result,    setResult]    = useState(null);
  const [apiError,  setApiError]  = useState('');

  const type = TYPES.find(t => t.id === txnType);

  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(SCHEMAS[txnType] ?? SCHEMAS.transfer) });

  const switchType = (id) => {
    setTxnType(id);
    setApiError('');
    reset();
  };

  const onSubmit = useCallback(async (data) => {
    setApiError('');
    const d = clean(data);
    try {
      let res;
      switch (txnType) {
        case 'deposit':
          res = await transactionService.deposit({
            accountId: d.accountId, amount: d.amount, currency: d.currency,
            channel: d.channel || 'branch', description: d.description,
            idempotencyKey: d.idempotencyKey,
          });
          break;
        case 'withdraw':
          res = await transactionService.withdraw({
            accountId: d.accountId, amount: d.amount, currency: d.currency,
            channel: d.channel || 'branch', cardId: d.cardId, description: d.description,
          });
          break;
        case 'transfer':
          res = await transactionService.transfer({
            sourceAccountId: d.sourceAccountId, destinationAccountId: d.destinationAccountId,
            amount: d.amount, currency: d.currency, channel: d.channel || 'web',
            description: d.description, idempotencyKey: d.idempotencyKey,
          });
          break;
        case 'card-payment':
          res = await transactionService.cardPayment({
            accountId: d.accountId, cardId: d.cardId, amount: d.amount, currency: d.currency,
            channel: d.channel || 'pos', merchantName: d.merchantName,
            merchantCategory: d.merchantCategory, description: d.description,
          });
          break;
        case 'upi':
          res = await transactionService.upiPayment({
            sourceAccountId: d.sourceAccountId, destinationAccountId: d.destinationAccountId,
            amount: d.amount, currency: d.currency, upiVpa: d.upiVpa, description: d.description,
          });
          break;
        case 'atm':
          res = await transactionService.atmWithdrawal({
            accountId: d.accountId, cardId: d.cardId, amount: d.amount,
            currency: d.currency, locationCity: d.locationCity,
          });
          break;
        case 'online':
          res = await transactionService.onlinePayment({
            accountId: d.accountId, cardId: d.cardId, amount: d.amount, currency: d.currency,
            channel: d.channel || 'web', merchantName: d.merchantName,
            merchantCategory: d.merchantCategory, description: d.description,
          });
          break;
        default:
          throw new Error('Unknown transaction type');
      }
      toast.success(`${type?.label} processed!`);
      setResult(res.data ?? res);
    } catch (err) {
      // Surface the first validation detail if available
      const details = err?.response?.data?.details;
      const firstDetail = Array.isArray(details) ? details[0]?.message : null;
      setApiError(firstDetail ?? err?.response?.data?.error ?? err.message ?? 'Transaction failed.');
    }
  }, [txnType, type]);

  const handleReset = () => { setResult(null); setApiError(''); reset(); };

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <ArrowLeftRight className="h-6 w-6 text-blue-600" />
          Make a Transaction
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          All transactions are scored in real-time by the XGBoost fraud engine.
        </p>
      </div>

      {result ? (
        <ResultCard result={result} onReset={handleReset} />
      ) : (
        <>
          {/* Type selector */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TYPES.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id} type="button" onClick={() => switchType(t.id)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium transition-all',
                    txnType === t.id
                      ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'
                  )}>
                  <Icon className="h-5 w-5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {type && <p className="text-xs text-gray-500 dark:text-gray-400">{type.desc}</p>}

          <ErrorMessage message={apiError} onDismiss={() => setApiError('')} />

          <form onSubmit={handleSubmit(onSubmit)} noValidate
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">

            {/* Amount + Currency */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <F label="Amount" required error={errors.amount}>
                  <Input type="number" step="0.01" min="0.01" placeholder="e.g. 5000"
                    {...register('amount')}
                    className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                </F>
              </div>
              <F label="Currency" error={errors.currency}>
                <Select {...register('currency')} className="w-full">
                  {['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </F>
            </div>

            {/* Account ID (single account types) */}
            {SHOW.accountId.has(txnType) && (
              <Controller
                name="accountId"
                control={control}
                render={({ field }) => (
                  <AccountInput
                    label="Account ID" required
                    placeholder="Account number (ACC-…) or UUID"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onError={() => {}}
                    error={errors.accountId?.message}
                  />
                )}
              />
            )}

            {/* Source + Destination (transfer / UPI) */}
            {SHOW.sourceAccountId.has(txnType) && (
              <Controller
                name="sourceAccountId"
                control={control}
                render={({ field }) => (
                  <AccountInput
                    label="Source Account ID" required
                    placeholder="Source account number (ACC-…) or UUID"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onError={() => {}}
                    error={errors.sourceAccountId?.message}
                  />
                )}
              />
            )}
            {SHOW.destAccountId.has(txnType) && (
              <Controller
                name="destinationAccountId"
                control={control}
                render={({ field }) => (
                  <AccountInput
                    label="Destination Account ID" required={txnType === 'transfer'}
                    placeholder="Destination account number (ACC-…) or UUID"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onError={() => {}}
                    error={errors.destinationAccountId?.message}
                  />
                )}
              />
            )}

            {/* Card ID */}
            {SHOW.cardId.has(txnType) && (
              <F label="Card ID" required={txnType !== 'withdraw'} error={errors.cardId}>
                <Input placeholder="UUID of the card" {...register('cardId')}
                  className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              </F>
            )}

            {/* UPI VPA */}
            {SHOW.upiVpa.has(txnType) && (
              <F label="UPI VPA" error={errors.upiVpa}>
                <Input placeholder="e.g. name@upi" {...register('upiVpa')}
                  className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              </F>
            )}

            {/* Channel */}
            {SHOW.channel.has(txnType) && CHANNEL_OPTIONS[txnType] && (
              <F label="Channel" error={errors.channel}>
                <Select {...register('channel')} className="w-full">
                  {CHANNEL_OPTIONS[txnType].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </F>
            )}

            {/* Merchant */}
            {SHOW.merchant.has(txnType) && (
              <div className="grid grid-cols-2 gap-4">
                <F label="Merchant Name" error={errors.merchantName}>
                  <Input placeholder="e.g. Amazon IN" {...register('merchantName')}
                    className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                </F>
                <F label="Merchant Category" error={errors.merchantCategory}>
                  <Input placeholder="e.g. e-commerce" {...register('merchantCategory')}
                    className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                </F>
              </div>
            )}

            {/* ATM location */}
            {SHOW.locationCity.has(txnType) && (
              <F label="ATM Location City" error={errors.locationCity}>
                <Input placeholder="e.g. Mumbai" {...register('locationCity')}
                  className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              </F>
            )}

            {/* Description */}
            <F label="Description" error={errors.description}>
              <Input placeholder="Optional memo" {...register('description')}
                className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
            </F>

            {/* Idempotency key */}
            <F label="Idempotency Key" error={errors.idempotencyKey}
              hint="Supply a UUID to prevent duplicate submissions on retry.">
              <Input placeholder="Optional — leave blank to auto-skip" {...register('idempotencyKey')}
                className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
            </F>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate('/transactions')}
                className="flex-1">Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1 gap-2">
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Processing…' : `Submit ${type?.label}`}
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
};

export default MakeTransactionForm;
