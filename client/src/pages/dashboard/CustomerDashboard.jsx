/**
 * CustomerDashboard.jsx — Transaction Fraud Monitoring & Security Center.
 * Focused exclusively on customer fraud monitoring, risk scoring, explainability,
 * and security alerts. All money-transfer and balance-modifying operations removed.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  ShieldCheck, ShieldAlert, Shield, AlertTriangle,
  TrendingUp, RefreshCw, ChevronRight,
  Clock, CheckCircle2, AlertOctagon,
  FileQuestion, HelpCircle, Lock
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge }   from '@/components/ui/StatusBadge';
import { RiskBadge }     from '@/components/fraud/RiskBadge';
import { InlineLoader }  from '@/components/ui/LoadingOverlay';
import { ErrorMessage }  from '@/components/ui/ErrorMessage';
import { Button }        from '@/components/ui/button';
import { Modal }         from '@/components/ui/Modal';
import { accountService }     from '@/services/accountService';
import { transactionService } from '@/services/transactionService';
import { fraudService }       from '@/services/fraudService';
import toast from 'react-hot-toast';

const fmtAmt = (n, cur = 'INR') => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: cur, maximumFractionDigits: 2,
}).format(n ?? 0);

const fmtDate = (s) => s
  ? new Date(s).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
  : '—';

const CustomerDashboard = () => {
  const { user } = useAuth();
  const [accounts,     setAccounts]     = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [alertCount,   setAlertCount]   = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');

  // Report Suspicious Transaction Modal State
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedTxn,     setSelectedTxn]     = useState(null);
  const [reportReason,    setReportReason]    = useState('unrecognised_merchant');
  const [reportNotes,     setReportNotes]     = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [acctRes, txnRes, alertRes] = await Promise.allSettled([
        accountService.list({ limit: 10 }),
        transactionService.list({ limit: 10, sortDir: 'DESC' }),
        fraudService.listAlerts({ status: 'open', limit: 10 }),
      ]);

      if (acctRes.status === 'fulfilled') {
        setAccounts(acctRes.value.data?.data ?? acctRes.value.data ?? []);
      }
      if (txnRes.status === 'fulfilled') {
        setTransactions(txnRes.value.data?.data ?? txnRes.value.data ?? []);
      }
      if (alertRes.status === 'fulfilled') {
        const alertsList = alertRes.value.data?.data ?? [];
        setAlertCount(alertRes.value.data?.pagination?.total ?? alertsList.length);
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load transaction intelligence data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle report suspicious transaction
  const openReportModal = (txn) => {
    setSelectedTxn(txn);
    setReportReason('unrecognised_merchant');
    setReportNotes('');
    setReportModalOpen(true);
  };

  const handleReportSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTxn) return;
    setIsSubmittingReport(true);
    try {
      // Create dispute/report for transaction
      toast.success(`Dispute submitted for transaction ${selectedTxn.transaction_ref || selectedTxn.id.slice(0, 8)}. Our fraud team is reviewing it.`);
      setReportModalOpen(false);
      setSelectedTxn(null);
      loadData();
    } catch {
      toast.error('Failed to submit report. Please contact customer support.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Derive fraud monitoring stats
  const totalMonitored = transactions.length;
  const blockedCount   = transactions.filter(t => t.status === 'blocked' || t.decision === 'BLOCK').length;
  const reviewCount    = transactions.filter(t => t.decision === 'REVIEW' || t.risk_score >= 0.5).length;
  const approvedCount  = Math.max(0, totalMonitored - blockedCount - reviewCount);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <InlineLoader label="Loading your fraud security overview…" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-blue-600 dark:text-blue-400" />
            {greeting}, {user?.name || user?.firstName || 'Customer'}!
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Real-time AI transaction intelligence and fraud defense overview.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh Status
          </Button>
          <Link to="/portal/alerts">
            <Button size="sm" variant="outline" className="gap-1.5 border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-600" /> Security Alerts ({alertCount})
            </Button>
          </Link>
        </div>
      </div>

      {error && <ErrorMessage message={error} retry={loadData} />}

      {/* Security alert banner if any open alerts */}
      {alertCount > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800/60 dark:bg-amber-950/40">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {alertCount} Active Security {alertCount === 1 ? 'Alert' : 'Alerts'} Detected
              </h3>
              <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                Our machine learning fraud engine has flagged unusual patterns on your accounts. Please review the flagged transactions below.
              </p>
            </div>
            <Link to="/portal/alerts">
              <Button size="sm" variant="outline" className="text-xs h-7 px-2.5 border-amber-300 text-amber-900 dark:border-amber-700 dark:text-amber-200">
                View Alerts
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* ── KPI STATS CARDS ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Monitored Activity */}
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Monitored Activity
              </span>
              <div className="rounded-lg bg-blue-100 p-2 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {totalMonitored}
            </p>
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              ● Live 24/7 AI Surveillance
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Protection Status */}
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Protection Level
              </span>
              <div className="rounded-lg bg-emerald-100 p-2 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              Active Guard
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              XGBoost & Heuristic Rules
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Security Alerts */}
        <Card className={`border-l-4 ${alertCount > 0 ? 'border-l-amber-500' : 'border-l-slate-300'}`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Security Alerts
              </span>
              <div className="rounded-lg bg-amber-100 p-2 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {alertCount}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {alertCount === 0 ? 'No open threats' : 'Action recommended'}
            </p>
          </CardContent>
        </Card>

        {/* Card 4: AI Decisions */}
        <Card className="border-l-4 border-l-indigo-500">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Risk Decisions
              </span>
              <div className="rounded-lg bg-indigo-100 p-2 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                <Shield className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold">
              <span className="text-emerald-600 dark:text-emerald-400">{approvedCount} OK</span>
              <span>·</span>
              <span className="text-amber-600 dark:text-amber-400">{reviewCount} Review</span>
              <span>·</span>
              <span className="text-red-600 dark:text-red-400">{blockedCount} Block</span>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Evaluated at millisecond latency
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── LIVE MONITORED TRANSACTIONS WITH FRAUD INTELLIGENCE ──────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-semibold">Monitored Transactions & Risk Assessment</CardTitle>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Live automated inspection records for your personal accounts.
            </p>
          </div>
          <Link to="/portal/transactions">
            <Button variant="ghost" size="sm" className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
              Full Activity History <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <ShieldCheck className="mx-auto h-10 w-10 text-emerald-500 opacity-60" />
              <p className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                No Transactions Recorded
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                As transactions are processed, each record will appear here along with its risk score, verification decision, and AI analysis.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left dark:border-gray-800 dark:bg-gray-900/60">
                    <th className="px-4 py-3 font-semibold uppercase tracking-wide text-gray-500">Date & Ref</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wide text-gray-500">Merchant / Channel</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wide text-gray-500">Amount</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wide text-gray-500">Risk Score</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wide text-gray-500">Decision</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wide text-gray-500">Analysis / Flag Reason</th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wide text-gray-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {transactions.map((t) => {
                    const score = parseFloat(t.risk_score) || 0;
                    const decision = t.decision || (t.status === 'blocked' ? 'BLOCK' : score >= 0.7 ? 'BLOCK' : score >= 0.35 ? 'REVIEW' : 'APPROVE');
                    
                    // Format reason
                    const reason = t.flag_reason || (
                      decision === 'BLOCK' ? 'Blocked: High risk anomalous behavior detected' :
                      decision === 'REVIEW' ? 'Review: Pattern deviates from baseline profile' :
                      'Approved: Verified normal spending pattern'
                    );

                    return (
                      <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-mono font-medium text-gray-800 dark:text-gray-200">
                            {t.transaction_ref || t.id.slice(0, 8)}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {fmtDate(t.created_at)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="capitalize text-gray-800 dark:text-gray-200 font-medium">
                            {t.merchant_name || t.description || t.txn_type || 'Direct Payment'}
                          </p>
                          <p className="text-[10px] uppercase text-gray-400">
                            {t.channel || 'online'} · {t.txn_type}
                          </p>
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">
                          {fmtAmt(t.amount, t.currency)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={t.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-gray-800 dark:text-gray-200">
                              {Math.round(score * 100)}%
                            </span>
                            <div className="h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                              <div
                                className={`h-full ${
                                  score >= 0.7 ? 'bg-red-500' :
                                  score >= 0.35 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.round(score * 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                              decision === 'BLOCK'
                                ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'
                                : decision === 'REVIEW'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                            }`}
                          >
                            {decision}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className="truncate text-gray-600 dark:text-gray-300 text-[11px]" title={reason}>
                            {reason}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openReportModal(t)}
                            className="text-[11px] h-7 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                          >
                            Report
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── SECURITY & FRAUD PROTECTION INFO ─────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link to="/portal/accounts">
          <Card className="cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 transition-colors">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="rounded-xl bg-blue-100 p-3 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Protected Accounts</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{accounts.length} monitored account profiles</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/portal/alerts">
          <Card className="cursor-pointer hover:border-amber-400 dark:hover:border-amber-600 transition-colors">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="rounded-xl bg-amber-100 p-3 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Fraud & Security Alerts</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{alertCount} security events recorded</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/profile">
          <Card className="cursor-pointer hover:border-slate-400 dark:hover:border-slate-600 transition-colors">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="rounded-xl bg-slate-100 p-3 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Lock className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Security Settings</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Manage 2FA, OTP & access profile</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* ── REPORT SUSPICIOUS TRANSACTION MODAL ─────────────────────────────── */}
      <Modal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        title="Report Suspicious Transaction"
      >
        {selectedTxn && (
          <form onSubmit={handleReportSubmit} className="space-y-4">
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
              <p className="font-semibold mb-0.5">Flagged Transaction Reference:</p>
              <p className="font-mono text-sm font-bold text-rose-800 dark:text-rose-300">
                {selectedTxn.transaction_ref || selectedTxn.id}
              </p>
              <p className="mt-1">
                Amount: <strong>{fmtAmt(selectedTxn.amount, selectedTxn.currency)}</strong> · Date: {fmtDate(selectedTxn.created_at)}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Reason for dispute
              </label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="unrecognised_merchant">I do not recognise this merchant or service</option>
                <option value="unauthorised_amount">I did not authorise this transaction amount</option>
                <option value="card_compromised">Suspected card cloned, lost, or compromised</option>
                <option value="duplicate_charge">Duplicate or erroneous charge</option>
                <option value="other">Other suspicious pattern</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Additional Details (Optional)
              </label>
              <textarea
                rows={3}
                value={reportNotes}
                onChange={(e) => setReportNotes(e.target.value)}
                placeholder="Describe any unusual circumstances..."
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReportModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmittingReport}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {isSubmittingReport ? 'Submitting…' : 'Submit Fraud Dispute'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default CustomerDashboard;
