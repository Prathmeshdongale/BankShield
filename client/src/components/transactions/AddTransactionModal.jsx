/**
 * AddTransactionModal.jsx — Interactive Transaction Simulator & Fraud Scorer.
 *
 * Allows users and staff to manually create / simulate transactions without
 * connecting to external core-banking web services.
 * Every created transaction is instantly scored by the XGBoost ML model
 * and rule-based fraud detection pipeline.
 */
import React, { useState, useEffect } from 'react';
import {
  PlusCircle, RefreshCw, AlertTriangle, ShieldCheck,
  Building2, CreditCard, ShoppingBag, Globe, MapPin,
  CheckCircle2, XCircle, ShieldAlert, ArrowRight, Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import { accountService } from '@/services/accountService';
import { transactionService } from '@/services/transactionService';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { RiskBadge } from '@/components/fraud/RiskBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';

const PRESET_AMOUNTS = [
  { label: '₹500 (Low)', value: 500 },
  { label: '₹2,500 (Everyday)', value: 2500 },
  { label: '₹15,000 (Medium)', value: 15000 },
  { label: '₹75,000 (Suspicious)', value: 75000 },
  { label: '₹250,000 (High-Risk)', value: 250000 },
];

const PRESET_MERCHANTS = [
  { name: 'Amazon India', cat: 'retail', city: 'Mumbai', country: 'IN' },
  { name: 'Starbucks Coffee', cat: 'food_dining', city: 'Bengaluru', country: 'IN' },
  { name: 'Reliance Digital', cat: 'electronics', city: 'New Delhi', country: 'IN' },
  { name: 'Luxury Diamond Jewellers', cat: 'luxury_goods', city: 'Mumbai', country: 'IN' },
  { name: 'Binance Crypto Global', cat: 'crypto', city: 'Dubai', country: 'AE' },
  { name: 'Macau VIP Casino Resort', cat: 'gambling', city: 'Macau', country: 'MO' },
];

export const AddTransactionModal = ({ open, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [cards, setCards] = useState([]);
  const [cardId, setCardId] = useState('');

  // Form State
  const [accountId, setAccountId] = useState('');
  const [channel, setChannel] = useState('web'); // 'web' | 'card' | 'pos' | 'upi' | 'atm' | 'deposit'
  const [amount, setAmount] = useState('2500');
  const [merchantName, setMerchantName] = useState('Amazon India');
  const [merchantCategory, setMerchantCategory] = useState('retail');
  const [city, setCity] = useState('Mumbai');
  const [country, setCountry] = useState('IN');
  const [description, setDescription] = useState('Online shopping transaction');

  // Submission & Result state
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // Evaluated fraud result

  // Fetch accounts on modal open
  useEffect(() => {
    if (!open) {
      setResult(null);
      return;
    }
    const fetchAccounts = async () => {
      setLoadingAccounts(true);
      try {
        const res = await accountService.list({ limit: 50 });
        const list = res.data?.data ?? [];
        setAccounts(list);
        const active = list.find(a => a.status === 'active');
        if (active) {
          setAccountId(active.id);
        } else if (list.length > 0) {
          setAccountId(list[0].id);
        }
      } catch (err) {
        toast.error('Failed to load accounts for transaction.');
      } finally {
        setLoadingAccounts(false);
      }
    };
    fetchAccounts();
  }, [open]);

  // Fetch cards whenever accountId changes
  useEffect(() => {
    if (!accountId) { setCards([]); setCardId(''); return; }
    accountService.listCards(accountId, { includeInactive: false })
      .then(res => {
        const list = res.data?.cards ?? [];
        setCards(list);
        if (list.length > 0) setCardId(list[0].id);
        else setCardId('');
      })
      .catch(() => setCards([]));
  }, [accountId]);

  const handleSelectPresetMerchant = (preset) => {
    setMerchantName(preset.name);
    setMerchantCategory(preset.cat);
    setCity(preset.city);
    setCountry(preset.country);
    setDescription(`Payment to ${preset.name}`);
  };

  const handleSelectOtherMerchant = () => {
    setMerchantName('');
    setMerchantCategory('other');
    setDescription('Custom merchant transaction');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!accountId) {
      toast.error('Please select an active account.');
      return;
    }
    const numAmt = parseFloat(amount);
    if (!numAmt || numAmt <= 0) {
      toast.error('Please enter a valid amount.');
      return;
    }

    setSubmitting(true);
    setResult(null);

    try {
      let res;
      if (channel === 'deposit') {
        res = await transactionService.deposit({
          accountId,
          amount: numAmt,
          currency: 'INR',
          channel: 'branch',
          description: description || 'Cash deposit into account',
        });
      } else if (channel === 'atm') {
        res = await transactionService.withdraw({
          accountId,
          amount: numAmt,
          currency: 'INR',
          channel: 'atm',
          description: description || 'ATM cash withdrawal',
        });
      } else if (channel === 'upi') {
        const vpaHandle = merchantName ? merchantName.toLowerCase().replace(/[^a-z0-9]/g, '') : 'payee';
        res = await transactionService.upiPayment({
          sourceAccountId: accountId,
          amount: numAmt,
          currency: 'INR',
          upiVpa: `${vpaHandle}@bank`,
          description: description || `UPI payment to ${merchantName || 'Merchant'}`,
        });
      } else {
        // 'web', 'card', or 'pos'
        res = await transactionService.onlinePayment({
          accountId,
          cardId: cardId || undefined,
          amount: numAmt,
          currency: 'INR',
          channel: channel === 'pos' ? 'mobile' : 'web',
          merchantName: merchantName || 'Custom Merchant',
          merchantCategory: merchantCategory || 'other',
          description: description || `Payment to ${merchantName || 'Merchant'}`,
        });
      }

      const txnData = res.data?.data ?? res.data?.transaction ?? res.data;
      setResult(txnData);
      toast.success('Transaction submitted and scored by fraud engine!');
      if (onSuccess) onSuccess();
    } catch (err) {
      const errMsg = err?.response?.data?.error || err.message || 'Transaction failed.';
      toast.error(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetForNext = () => {
    setResult(null);
    setAmount('2500');
  };

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title="Add & Simulate Transaction (Fraud Engine Scored)"
      size="lg"
    >
      <div className="space-y-4">
        {/* Banner */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
          <div className="flex items-center gap-2 font-semibold mb-1">
            <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Core Banking Simulator & Real-time AI Risk Evaluation
          </div>
          <p className="text-[11px] leading-relaxed opacity-90">
            Since this platform operates independently of external core-banking web services, you can simulate customer transactions below. Each transaction is passed directly through XGBoost inference and heuristic rules.
          </p>
        </div>

        {/* If result is ready, display live scoring outcome */}
        {result ? (
          <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/80 p-5 dark:border-gray-800 dark:bg-gray-900/80 animate-fade-in">
            <div className="flex items-center justify-between border-b pb-3 border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2">
                {result.is_fraud || result.status === 'blocked' ? (
                  <ShieldAlert className="h-6 w-6 text-rose-600" />
                ) : result.status === 'flagged' ? (
                  <AlertTriangle className="h-6 w-6 text-amber-500" />
                ) : (
                  <ShieldCheck className="h-6 w-6 text-emerald-600" />
                )}
                <div>
                  <h3 className="font-bold text-sm text-gray-900 dark:text-white">
                    Fraud Evaluation Result
                  </h3>
                  <p className="text-xs text-gray-500 font-mono">
                    Ref: {result.transaction_ref || result.transactionRef || 'TXN-GENERATED'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge value={result.status} />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg bg-white p-2.5 shadow-sm dark:bg-gray-800">
                <span className="text-[10px] text-gray-400 uppercase font-medium">Risk Score</span>
                <p className="text-xl font-black mt-0.5 text-gray-900 dark:text-white">
                  {result.risk_score ?? result.riskScore ?? 0}
                  <span className="text-xs text-gray-400 font-normal"> / 100</span>
                </p>
              </div>

              <div className="rounded-lg bg-white p-2.5 shadow-sm dark:bg-gray-800">
                <span className="text-[10px] text-gray-400 uppercase font-medium">Decision</span>
                <div className="mt-1">
                  <RiskBadge
                    score={result.risk_score ?? result.riskScore ?? 0}
                    isFraud={result.is_fraud ?? (result.status === 'blocked')}
                  />
                </div>
              </div>

              <div className="rounded-lg bg-white p-2.5 shadow-sm dark:bg-gray-800">
                <span className="text-[10px] text-gray-400 uppercase font-medium">Amount</span>
                <p className="text-base font-bold text-gray-900 dark:text-white mt-1">
                  ₹{parseFloat(result.amount ?? amount).toLocaleString('en-IN')}
                </p>
              </div>

              <div className="rounded-lg bg-white p-2.5 shadow-sm dark:bg-gray-800">
                <span className="text-[10px] text-gray-400 uppercase font-medium">Channel</span>
                <p className="text-xs font-semibold uppercase text-gray-800 dark:text-gray-200 mt-1">
                  {result.channel || channel}
                </p>
              </div>
            </div>

            {/* Fraud Explanation / Factors */}
            {(result.fraud_reasons?.length > 0 || result.fraudReasons?.length > 0) && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-900 dark:bg-rose-950/40 dark:border-rose-900/40 dark:text-rose-200">
                <p className="font-semibold flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  Risk Factors Flagged by AI Engine:
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {(result.fraud_reasons || result.fraudReasons).map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={handleResetForNext}>
                Simulate Another Transaction
              </Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={onClose}>
                Done & View Ledger
              </Button>
            </div>
          </div>
        ) : (
          /* Form for Creating Transaction */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Account Selector */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                Select Account
              </label>
              {loadingAccounts ? (
                <div className="py-2 text-xs text-gray-400">Loading accounts…</div>
              ) : accounts.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                  No accounts found. Please open an account in <strong>My Accounts</strong> first before simulating transactions.
                </div>
              ) : (
                <Select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  required
                >
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.account_number} — {a.account_type?.toUpperCase()} (Balance: ₹{parseFloat(a.balance ?? 0).toLocaleString('en-IN')})
                    </option>
                  ))}
                </Select>
              )}
            </div>

            {/* Channel / Type & Amount */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Transaction Channel
                </label>
                <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
                  <option value="web">Online Web E-Commerce</option>
                  <option value="card">Linked Debit / Credit Card</option>
                  <option value="pos">In-Store POS Terminal (Swipe/Tap)</option>
                  <option value="upi">UPI Instant Transfer</option>
                  <option value="atm">ATM Cash Withdrawal</option>
                  <option value="deposit">Deposit Funds (Credit Balance)</option>
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Amount (INR ₹)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 2500"
                  required
                />
              </div>
            </div>

            {/* Linked Card Selector (for card & pos channels) */}
            {(channel === 'card' || channel === 'pos') && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Select Linked Card (Optional)
                </label>
                {cards.length === 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-[11px] text-gray-500 dark:border-gray-800 dark:bg-gray-900">
                    No active cards found for this account. Will process as account card payment.
                  </div>
                ) : (
                  <Select value={cardId} onChange={(e) => setCardId(e.target.value)}>
                    {cards.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.card_network?.toUpperCase()} {c.card_type?.toUpperCase()} — •••• {c.last_four || c.card_number?.slice(-4)} (Exp: {c.expiry_month}/{c.expiry_year})
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            )}

            {/* Quick Amount Chips */}
            <div>
              <p className="text-[11px] text-gray-500 mb-1.5 font-medium">Quick Amount Presets:</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_AMOUNTS.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setAmount(String(p.value))}
                    className={`rounded-md border px-2 py-1 text-xs font-medium transition ${
                      amount === String(p.value)
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-200'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Merchant Presets (for payment channels) */}
            {channel !== 'deposit' && channel !== 'atm' && (
              <div>
                <p className="text-[11px] text-gray-500 mb-1.5 font-medium">Test Merchant Scenarios:</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PRESET_MERCHANTS.map((pm, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectPresetMerchant(pm)}
                      className={`text-left rounded-lg border p-2 text-xs transition ${
                        merchantName === pm.name
                          ? 'border-blue-500 bg-blue-50/60 dark:border-blue-500 dark:bg-blue-950/30'
                          : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                      }`}
                    >
                      <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{pm.name}</p>
                      <p className="text-[10px] text-gray-400 capitalize">{pm.cat} · {pm.city}, {pm.country}</p>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleSelectOtherMerchant}
                    className={`text-left rounded-lg border p-2 text-xs transition border-dashed ${
                      merchantCategory === 'other' || !PRESET_MERCHANTS.some(pm => pm.name === merchantName)
                        ? 'border-blue-500 bg-blue-50/60 dark:border-blue-500 dark:bg-blue-950/30'
                        : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                    }`}
                  >
                    <p className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                      <Plus className="h-3.5 w-3.5" /> Other Merchant
                    </p>
                    <p className="text-[10px] text-gray-400">Custom / Enter your own</p>
                  </button>
                </div>
              </div>
            )}

            {/* Merchant Details & Location */}
            {channel !== 'deposit' && channel !== 'atm' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Merchant Name *
                  </label>
                  <Input
                    value={merchantName}
                    onChange={(e) => setMerchantName(e.target.value)}
                    placeholder="e.g. Swiggy, Netflix, Local Store"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Category *
                  </label>
                  <Select value={merchantCategory} onChange={(e) => setMerchantCategory(e.target.value)}>
                    <option value="other">Other / Custom Services</option>
                    <option value="retail">Retail & Shopping</option>
                    <option value="groceries">Groceries & Supermarket</option>
                    <option value="food_dining">Food & Dining</option>
                    <option value="electronics">Electronics & Gadgets</option>
                    <option value="travel">Travel & Airlines</option>
                    <option value="entertainment">Entertainment & Streaming</option>
                    <option value="utilities">Bills & Utilities</option>
                    <option value="luxury_goods">Luxury Goods & Jewelry</option>
                    <option value="crypto">Cryptocurrency Exchange</option>
                    <option value="gambling">Online Gambling & Casino</option>
                    <option value="healthcare">Healthcare & Pharmacy</option>
                    <option value="education">Education & Fees</option>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Location (City)
                </label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Mumbai"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Country Code
                </label>
                <Input
                  value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                  maxLength={2}
                  placeholder="IN"
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="mt-5 flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || accounts.length === 0}
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                {submitting ? 'Running AI Fraud Scoring…' : 'Execute & Score Transaction'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};

export default AddTransactionModal;
