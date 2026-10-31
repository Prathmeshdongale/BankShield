/**
 * SecurityOtpVerification.jsx — /portal/security-verification
 *
 * Dedicated Security OTP Verification Module for BankShield users.
 * Allows customers and administrators to:
 *   • Perform on-demand Step-Up Cryptographic OTP Verification
 *   • Test and verify multi-factor security codes
 *   • Inspect active 2FA security health and delivery channel status
 *   • Review recent security verification audit logs
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, KeyRound, Mail, RefreshCw, CheckCircle2,
  AlertTriangle, Lock, Clock, RotateCw, ArrowRight, ShieldAlert,
  Smartphone, FileCheck, ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';
import { securityOtpService } from '@/services/securityOtpService';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InlineLoader } from '@/components/ui/LoadingOverlay';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

const VERIFICATION_PURPOSES = [
  {
    id: 'security_verification',
    label: 'Account Identity Verification',
    desc: 'Verify your multi-factor identity and update your security token status',
    badge: 'Standard 2FA',
  },
  {
    id: 'account_closure',
    label: 'Account Closure Authorization',
    desc: 'Elevated authorization required for settling and terminating a bank account',
    badge: 'Critical Operation',
  },
  {
    id: 'card_removal',
    label: 'Card Deletion Authorization',
    desc: 'Two-step cryptographic verification for removing or deleting linked cards',
    badge: 'Wallet Protection',
  },
  {
    id: 'high_value_transaction',
    label: 'High-Value Transfer Challenge',
    desc: 'Step-up authentication required for high-risk and flagged transfers',
    badge: 'Fraud Shield',
  },
];

const SecurityOtpVerification = () => {
  const [statusData,    setStatusData]    = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [error,         setError]         = useState('');

  // Active Verification Station state
  const [selectedPurpose, setSelectedPurpose] = useState('security_verification');
  const [stationStep,     setStationStep]     = useState('idle'); // 'idle' | 'dispatched' | 'verified'
  const [otpCode,         setOtpCode]         = useState('');
  const [devOtp,          setDevOtp]          = useState(null);
  const [dispatchedEmail, setDispatchedEmail] = useState('');
  const [isDispatching,   setIsDispatching]   = useState(false);
  const [isVerifying,     setIsVerifying]     = useState(false);
  const [resendCooldown,  setResendCooldown]  = useState(0);
  const [timerSeconds,    setTimerSeconds]    = useState(300);
  const [verifiedToken,   setVerifiedToken]   = useState(null);

  // Load Status & Verification Log
  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await securityOtpService.getStatus();
      setStatusData(res.data ?? null);
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Failed to load security status.');
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Expiry timer
  useEffect(() => {
    if (stationStep !== 'dispatched' || timerSeconds <= 0) return;
    const interval = setInterval(() => {
      setTimerSeconds(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [stationStep, timerSeconds]);

  // Resend timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown(c => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // 1. Dispatch OTP
  const handleDispatchOtp = async () => {
    setIsDispatching(true);
    setError('');
    try {
      const res = await securityOtpService.requestOtp(selectedPurpose);
      setDispatchedEmail(res.data?.email || '');
      setDevOtp(res.data?.devOtp ?? null);
      setStationStep('dispatched');
      setOtpCode('');
      setVerifiedToken(null);
      setTimerSeconds(300);
      setResendCooldown(30);
      toast.success('6-digit security OTP dispatched to your email.');
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Failed to dispatch security code.');
    } finally {
      setIsDispatching(false);
    }
  };

  // 2. Verify OTP
  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    if (otpCode.length !== 6) return;
    setIsVerifying(true);
    setError('');
    try {
      const res = await securityOtpService.verifyOtp({
        otp: otpCode,
        purpose: selectedPurpose,
      });
      setVerifiedToken(res.data?.verificationToken);
      setStationStep('verified');
      toast.success('Security verification confirmed successfully!');
      await loadStatus();
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Invalid or expired OTP code.');
    } finally {
      setIsVerifying(false);
    }
  };

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">

      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900 dark:text-white">
            <KeyRound className="h-6 w-6 text-blue-600" />
            Security &amp; OTP Verification Module
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Multi-factor cryptographic authorization engine for elevated security and critical banking operations.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadStatus} disabled={loadingStatus} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loadingStatus ? 'animate-spin' : ''}`} /> Refresh Status
        </Button>
      </div>

      {/* ── 2FA Security Health Bar ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Two-Factor Protection
            </p>
          </div>
          <p className="mt-2 text-xl font-bold text-emerald-950 dark:text-emerald-100">
            Enforced &amp; Active
          </p>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
            Cryptographic single-use email verification
          </p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
          <div className="flex items-center gap-2.5">
            <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-300">
              Delivery Channel
            </p>
          </div>
          <p className="mt-2 text-sm font-mono font-semibold text-blue-950 dark:text-blue-100 truncate">
            {statusData?.registeredEmail || 'Internal Email'}
          </p>
          <p className="text-[11px] text-blue-700 dark:text-blue-400 mt-0.5">
            Primary registered communication email
          </p>
        </div>

        <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4 dark:border-purple-900/40 dark:bg-purple-950/20">
          <div className="flex items-center gap-2.5">
            <Clock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-purple-800 dark:text-purple-300">
              Last Verified Action
            </p>
          </div>
          <p className="mt-2 text-sm font-semibold text-purple-950 dark:text-purple-100">
            {statusData?.lastVerifiedAt ? new Date(statusData.lastVerifiedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Ready for verification'}
          </p>
          <p className="text-[11px] text-purple-700 dark:text-purple-400 mt-0.5">
            Zero security breaches detected
          </p>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />

      {/* ── Main Section: Interactive Verification Station ──────────────────── */}
      <Card className="border-blue-100 shadow-sm dark:border-blue-950/40">
        <CardHeader className="bg-gradient-to-r from-blue-50/70 to-indigo-50/40 pb-3 dark:from-blue-950/20 dark:to-indigo-950/20">
          <CardTitle className="flex items-center gap-2 text-base text-gray-900 dark:text-white">
            <ShieldAlert className="h-5 w-5 text-blue-600" />
            Step-Up Verification Station
          </CardTitle>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Select a critical operation context to request and authorize an instant cryptographic OTP challenge.
          </p>
        </CardHeader>

        <CardContent className="pt-5 space-y-5">

          {/* Purpose Selector */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Select Security Action Context:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {VERIFICATION_PURPOSES.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedPurpose(p.id);
                    if (stationStep !== 'idle') setStationStep('idle');
                  }}
                  className={`flex items-start justify-between rounded-xl border p-3.5 cursor-pointer transition ${
                    selectedPurpose === p.id
                      ? 'border-blue-500 bg-blue-50/60 shadow-sm dark:border-blue-500 dark:bg-blue-950/30'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700'
                  }`}
                >
                  <div className="space-y-1 pr-2">
                    <p className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      {p.label}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                      {p.desc}
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 shrink-0 dark:bg-blue-900/40 dark:text-blue-300">
                    {p.badge}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── STEP 1: Idle — Request Code ─────────────────────────────────── */}
          {stationStep === 'idle' && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-6 text-center dark:border-gray-700 dark:bg-gray-800/40">
              <KeyRound className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Ready to Initiate Security Challenge
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1 mb-4">
                Clicking the button below dispatches a cryptographic 6-digit code to your registered email with 5-minute validity.
              </p>
              <Button
                onClick={handleDispatchOtp}
                disabled={isDispatching}
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 shadow-sm"
              >
                {isDispatching && <RefreshCw className="h-4 w-4 animate-spin" />}
                {isDispatching ? 'Generating Secure Code…' : 'Dispatch Security Verification OTP'}
                {!isDispatching && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          )}

          {/* ── STEP 2: Dispatched — Enter Code ─────────────────────────────── */}
          {stationStep === 'dispatched' && (
            <div className="rounded-xl border border-blue-200 bg-white p-5 space-y-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-blue-600" />
                  <span className="text-xs text-gray-600 dark:text-gray-300">
                    Code sent to: <strong className="font-mono text-gray-900 dark:text-white">{dispatchedEmail}</strong>
                  </span>
                </div>
                <span className={`text-xs font-mono font-bold ${timerSeconds < 60 ? 'text-rose-500' : 'text-blue-600'}`}>
                  Expires in {formatTimer(timerSeconds)}
                </span>
              </div>

              {/* Dev mode helper */}
              {devOtp && (
                <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
                  <span className="flex items-center gap-1.5 font-mono">
                    <KeyRound className="h-3.5 w-3.5 text-amber-600" />
                    Dev Sandbox Code: <strong>{devOtp}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setOtpCode(devOtp)}
                    className="rounded bg-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-300 dark:bg-amber-800 dark:text-amber-100"
                  >
                    Auto-Fill
                  </button>
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-4 max-w-sm mx-auto text-center">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    Enter 6-Digit OTP Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    autoFocus
                    className="w-full text-center tracking-[12px] font-mono text-3xl font-extrabold rounded-xl border border-gray-300 dark:border-gray-600 bg-slate-50 dark:bg-gray-900 py-3.5 text-gray-900 dark:text-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition"
                  />
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => { setStationStep('idle'); setOtpCode(''); }}
                    className="text-gray-500 hover:underline"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={resendCooldown > 0 || isDispatching}
                    onClick={handleDispatchOtp}
                    className="flex items-center gap-1 text-blue-600 hover:underline disabled:opacity-50"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                  </button>
                </div>

                <Button
                  type="submit"
                  disabled={isVerifying || otpCode.length !== 6 || timerSeconds <= 0}
                  className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5"
                >
                  {isVerifying && <RefreshCw className="h-4 w-4 animate-spin" />}
                  {isVerifying ? 'Verifying OTP…' : 'Verify & Confirm Authorization'}
                </Button>
              </form>
            </div>
          )}

          {/* ── STEP 3: Verified — Success Confirmation ─────────────────────── */}
          {stationStep === 'verified' && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-6 text-center space-y-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h3 className="text-base font-bold text-emerald-950 dark:text-emerald-100">
                Security Authorization Confirmed
              </h3>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 max-w-md mx-auto">
                Your cryptographic OTP verification for <strong>{VERIFICATION_PURPOSES.find(p => p.id === selectedPurpose)?.label}</strong> has been confirmed and logged in your security audit trail.
              </p>

              {verifiedToken && (
                <div className="rounded-lg border border-emerald-300 bg-white/80 p-3 max-w-md mx-auto dark:border-emerald-800 dark:bg-gray-900">
                  <p className="text-[10px] uppercase font-semibold text-gray-500">
                    Single-Use Verification Token
                  </p>
                  <p className="font-mono text-xs text-gray-800 dark:text-gray-200 break-all select-all mt-0.5">
                    {verifiedToken}
                  </p>
                </div>
              )}

              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStationStep('idle')}
                  className="text-xs font-semibold"
                >
                  Conduct Another Verification
                </Button>
              </div>
            </div>
          )}

        </CardContent>
      </Card>

      {/* ── Recent Security Verifications Audit Stream ──────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-gray-900 dark:text-white">
            <FileCheck className="h-5 w-5 text-gray-500" />
            Security Verification Audit Stream
          </CardTitle>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Immutable log of recent multi-factor OTP verification requests and authorizations.
          </p>
        </CardHeader>
        <CardContent>
          {loadingStatus ? (
            <InlineLoader label="Loading audit stream…" />
          ) : !statusData?.recentVerifications?.length ? (
            <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-xs text-gray-400 dark:border-gray-700">
              No recent OTP verification challenges recorded.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {statusData.recentVerifications.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-3">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">
                      {item.purposeTitle}
                    </p>
                    <p className="text-[11px] text-gray-500 font-mono">
                      {new Date(item.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                      item.status === 'verified'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : item.status === 'expired'
                        ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                    }`}>
                      {item.status?.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
};

export default SecurityOtpVerification;
