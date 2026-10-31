/**
 * SecurityOtpModal.jsx — Reusable Step-Up Security OTP Verification Modal.
 *
 * Enforces cryptographic 2FA verification before permitting sensitive operations
 * like Account Closure, Card Deletion, or Security Settings changes.
 */
import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, Mail, RefreshCw, KeyRound, AlertCircle,
  ArrowRight, CheckCircle2, RotateCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import { securityOtpService } from '@/services/securityOtpService';
import { Button } from '@/components/ui/button';
import Modal from '@/components/ui/Modal';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

const PURPOSE_TITLES = {
  account_closure: 'Verify Account Closure',
  card_removal: 'Verify Card Removal',
  password_change: 'Verify Password Update',
  security_verification: 'Security Authorization',
  high_value_transaction: 'Verify High-Value Transfer',
};

export const SecurityOtpModal = ({
  open,
  onClose,
  onVerified,
  purpose = 'security_verification',
  title = null,
  description = null,
  actionButtonText = 'Verify & Authorize',
}) => {
  const [step,            setStep]            = useState('request'); // 'request' | 'verify'
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');
  const [otpCode,         setOtpCode]         = useState('');
  const [maskedEmail,     setMaskedEmail]     = useState('');
  const [devOtp,          setDevOtp]          = useState(null);
  const [resendCooldown,  setResendCooldown]  = useState(0);
  const [timerSeconds,    setTimerSeconds]    = useState(300);

  const displayTitle = title || PURPOSE_TITLES[purpose] || 'Security Verification';

  // Countdown timer for 5-minute expiry
  useEffect(() => {
    if (step !== 'verify' || timerSeconds <= 0) return;
    const interval = setInterval(() => {
      setTimerSeconds(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [step, timerSeconds]);

  // Resend cooldown timer (30s)
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown(c => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // Auto-dispatch OTP when modal opens
  useEffect(() => {
    if (open) {
      setError('');
      setOtpCode('');
      handleSendOtp();
    } else {
      setStep('request');
      setDevOtp(null);
    }
  }, [open, purpose]); // eslint-disable-line

  const handleSendOtp = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await securityOtpService.requestOtp(purpose);
      const email = res.data?.email || '';
      setMaskedEmail(email);
      setDevOtp(res.data?.devOtp ?? null);
      setStep('verify');
      setTimerSeconds(300);
      setResendCooldown(30);
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Failed to dispatch security OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e?.preventDefault();
    if (otpCode.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const res = await securityOtpService.verifyOtp({ otp: otpCode, purpose });
      toast.success('Security verification confirmed.');
      if (onVerified) {
        onVerified(res.data?.verificationToken);
      }
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <Modal open={open} onClose={() => !loading && onClose()} title={displayTitle} size="sm">
      <div className="space-y-4">
        {/* Informational banner */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
          <p className="font-semibold flex items-center gap-1.5 mb-1">
            <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Two-Step Security Protection
          </p>
          <p className="text-[11px] leading-relaxed">
            {description || 'To safeguard your account from unauthorized actions, enter the single-use 6-digit cryptographic verification code sent to your registered email.'}
          </p>
        </div>

        {maskedEmail && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Code dispatched to: <strong className="font-mono text-gray-800 dark:text-gray-200">{maskedEmail}</strong>
          </p>
        )}

        {/* Development helper */}
        {devOtp && (
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
            <span className="flex items-center gap-1.5 font-mono">
              <KeyRound className="h-3.5 w-3.5 text-amber-600" />
              Dev OTP: <strong>{devOtp}</strong>
            </span>
            <button
              type="button"
              onClick={() => setOtpCode(devOtp)}
              className="rounded bg-amber-200/80 px-2 py-0.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-300 dark:bg-amber-800 dark:text-amber-100"
            >
              Autofill
            </button>
          </div>
        )}

        {/* Error message */}
        {error && <ErrorMessage message={error} onDismiss={() => setError('')} />}

        {/* Verification Form */}
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="otpCode" className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                6-Digit Security Code
              </label>
              <span className={`text-[11px] font-mono ${timerSeconds < 60 ? 'text-rose-500 font-bold' : 'text-gray-400'}`}>
                Expires in {formatTimer(timerSeconds)}
              </span>
            </div>
            <input
              id="otpCode"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              autoFocus
              className="w-full text-center tracking-[12px] font-mono text-2xl font-bold rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 py-3 text-gray-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
            />
          </div>

          <div className="flex items-center justify-between pt-1 text-xs">
            <button
              type="button"
              disabled={resendCooldown > 0 || loading}
              onClick={handleSendOtp}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 disabled:opacity-50"
            >
              <RotateCw className="h-3.5 w-3.5" />
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
            </button>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || otpCode.length !== 6 || timerSeconds <= 0}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {actionButtonText}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default SecurityOtpModal;
