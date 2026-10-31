/**
 * Login.jsx — Unified MFA/OTP sign-in page for ALL FOUR ROLES:
 *  1. Customer (Self-registration & Login)
 *  2. Bank Manager
 *  3. Super Admin (Passwordless OTP verification via registered email)
 *  4. Fraud Analyst
 *
 * Flow:
 *  - Standard Login: Validate email & password credentials -> Dispatches 5-minute cryptographic OTP to email -> Verifies OTP -> Grants session
 *  - Super Admin OTP Login: Enters Super Admin email -> Directly dispatches OTP to email -> Verifies OTP -> Grants session
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import {
  ShieldCheck, Eye, EyeOff, Loader2, KeyRound,
  Mail, ArrowRight, UserPlus, CheckCircle2, RotateCw,
  ShieldAlert, Lock
} from 'lucide-react';
import { useAuth }     from '@/context/AuthContext';
import { ErrorMessage, FieldError } from '@/components/ui/ErrorMessage';

const loginSchema = z.object({
  email   : z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

const Login = () => {
  const { login, verifyLoginOtp, sendSuperAdminOtp, resendOtp } = useAuth();
  const navigate                         = useNavigate();
  const location                         = useLocation();
  const from                             = location.state?.from?.pathname ?? '/';

  // Mode: 'standard' | 'superadmin'
  const [loginMode,    setLoginMode]    = useState('standard');
  const [adminEmail,   setAdminEmail]   = useState('superadmin@bankshield.internal');
  const [isSendingAdminOtp, setIsSendingAdminOtp] = useState(false);

  // Step state: 'credentials' | 'otp'
  const [step,         setStep]         = useState('credentials');
  const [showPw,       setShowPw]       = useState(false);
  const [apiError,     setApiError]     = useState('');

  // OTP State
  const [userEmail,    setUserEmail]    = useState('');
  const [userRole,     setUserRole]     = useState('');
  const [userName,     setUserName]     = useState('');
  const [otpCode,      setOtpCode]      = useState('');
  const [devOtp,       setDevOtp]       = useState(null);
  const [isVerifying,  setIsVerifying]  = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(loginSchema) });
  const watchedEmail = watch('email');

  // Cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(c => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // ── Step 1 (Standard): Submit Email + Password ──────────────────────────────
  const onCredentialsSubmit = async ({ email, password }) => {
    setApiError('');
    // Super Admin exclusively logs in by email OTP (never password)
    if (email?.toLowerCase()?.includes('admin')) {
      setLoginMode('superadmin');
      setAdminEmail(email);
      setIsSendingAdminOtp(true);
      try {
        const res = await sendSuperAdminOtp(email);
        setUserEmail(email);
        setUserRole('super_admin');
        setUserName('Super Admin');
        if (res?.devOtp) setDevOtp(res.devOtp);
        setStep('otp');
        setResendCooldown(30);
      } catch (err) {
        setApiError(err?.response?.data?.error ?? 'Failed to dispatch Super Admin OTP.');
      } finally {
        setIsSendingAdminOtp(false);
      }
      return;
    }

    try {
      const res = await login(email, password);

      if (res?.requiresOtp) {
        setUserEmail(res.email);
        setUserRole(res.role || '');
        setUserName(res.firstName || '');
        setDevOtp(res.devOtp ?? null);
        setStep('otp');
        setResendCooldown(30);
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      if (err?.response?.data?.error) {
        setApiError(err.response.data.error);
      } else if (!err?.response || err?.code === 'ERR_NETWORK') {
        setApiError('Unable to connect to backend server (http://localhost:5000). Please ensure the backend is running.');
      } else {
        setApiError('Invalid email or password.');
      }
    }
  };

  // ── Step 1 (Super Admin): Request OTP via Email directly ────────────────────
  const onSuperAdminOtpRequest = async (e) => {
    e?.preventDefault();
    if (!adminEmail || !adminEmail.includes('@')) {
      setApiError('Please enter a valid Super Admin email address.');
      return;
    }
    setApiError('');
    setIsSendingAdminOtp(true);
    try {
      const res = await sendSuperAdminOtp(adminEmail.trim());
      setUserEmail(res.email || adminEmail.trim());
      setUserRole('super_admin');
      setUserName(res.firstName || 'Super Administrator');
      setDevOtp(res.devOtp ?? null);
      setStep('otp');
      setResendCooldown(30);
    } catch (err) {
      if (err?.response?.data?.error) {
        setApiError(err.response.data.error);
      } else if (!err?.response || err?.code === 'ERR_NETWORK') {
        setApiError('Unable to connect to backend server. Please verify backend is running.');
      } else {
        setApiError('Failed to dispatch Super Admin OTP. Please check email address.');
      }
    } finally {
      setIsSendingAdminOtp(false);
    }
  };

  // ── Step 2: Verify OTP & Issue Token (All Roles) ───────────────────────────
  const onVerifyOtp = async (e) => {
    e?.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setApiError('Please enter the 6-digit verification code.');
      return;
    }
    setApiError('');
    setIsVerifying(true);
    try {
      await verifyLoginOtp(userEmail, otpCode.trim());
      navigate(from, { replace: true });
    } catch (err) {
      if (err?.response?.data?.error) {
        setApiError(err.response.data.error);
      } else {
        setApiError('Invalid or expired verification code. Please check your email or request a new code.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  // ── Resend OTP ─────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setApiError('');
    try {
      if (loginMode === 'superadmin') {
        const res = await sendSuperAdminOtp(userEmail);
        if (res?.devOtp) setDevOtp(res.devOtp);
      } else {
        const res = await resendOtp(userEmail);
        if (res?.devOtp) setDevOtp(res.devOtp);
      }
      setResendCooldown(30);
    } catch (err) {
      setApiError(err?.response?.data?.error ?? 'Failed to resend verification code.');
    }
  };

  const fieldCls =
    'w-full rounded-lg border px-3 py-2 text-sm outline-none transition ' +
    'placeholder:text-slate-400 ' +
    'focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 ' +
    'border-slate-300 bg-white text-slate-900 ' +
    'dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 ' +
    'dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-400/20 ' +
    'disabled:opacity-50';

  return (
    <div className={
      'flex min-h-screen items-center justify-center p-4 ' +
      'bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 ' +
      'dark:from-[#0a0f1a] dark:via-[#0d1525] dark:to-[#0a0f1a]'
    }>
      <div className="w-full max-w-md">

        {/* Card */}
        <div className={
          'rounded-2xl border p-8 shadow-xl ' +
          'border-slate-200 bg-white ' +
          'dark:border-slate-700/50 dark:bg-gray-900'
        }>
          {/* Logo */}
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/30">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Bank<span className="text-blue-600 dark:text-blue-400">Shield</span>
            </h1>
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              {step === 'otp'
                ? 'Two-factor OTP authentication'
                : loginMode === 'superadmin'
                  ? 'Super Administrator Email OTP Sign-in'
                  : 'Sign in to your fraud operations account'}
            </p>
          </div>

          {/* Mode Switcher Tabs (Only visible when entering credentials) */}
          {step === 'credentials' && (
            <div className="mb-6 flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => { setLoginMode('standard'); setApiError(''); }}
                className={
                  'flex-1 rounded-lg py-2 text-xs font-semibold transition ' +
                  (loginMode === 'standard'
                    ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-900 dark:text-blue-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200')
                }
              >
                Standard Sign-In
              </button>
              <button
                type="button"
                onClick={() => { setLoginMode('superadmin'); setApiError(''); }}
                className={
                  'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ' +
                  (loginMode === 'superadmin'
                    ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-900 dark:text-blue-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200')
                }
              >
                <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                Super Admin (OTP Only)
              </button>
            </div>
          )}

          {/* Error Banner */}
          {apiError && (
            <div className="mb-4">
              <ErrorMessage message={apiError} onDismiss={() => setApiError('')} />
            </div>
          )}

          {/* ── STEP 1: SUPER ADMIN PASSWORDLESS OTP REQUEST ─────────────────── */}
          {step === 'credentials' && loginMode === 'superadmin' && (
            <form onSubmit={onSuperAdminOtpRequest} className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="font-semibold flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  Passwordless Administrator Access
                </p>
                <p className="text-[11px] leading-relaxed">
                  Super Administrator accounts sign in exclusively using single-use cryptographic verification codes dispatched directly to registered internal email.
                </p>
              </div>

              <div>
                <label htmlFor="adminEmail" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Super Admin Email
                </label>
                <input
                  id="adminEmail"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className={fieldCls}
                  placeholder="superadmin@bankshield.internal"
                  autoFocus
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isSendingAdminOtp}
                className={
                  'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 ' +
                  'text-sm font-semibold text-white shadow-sm transition ' +
                  'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 ' +
                  'dark:bg-amber-600 dark:hover:bg-amber-500 ' +
                  'focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ' +
                  'dark:focus:ring-offset-gray-900 disabled:opacity-60'
                }
              >
                {isSendingAdminOtp && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSendingAdminOtp ? 'Dispatching OTP…' : 'Send OTP to Super Admin Email'}
                {!isSendingAdminOtp && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>
          )}

          {/* ── STEP 1: STANDARD CREDENTIALS FORM ───────────────────────────── */}
          {step === 'credentials' && loginMode === 'standard' && (
            <form onSubmit={handleSubmit(onCredentialsSubmit)} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  disabled={isSubmitting}
                  className={fieldCls}
                  {...register('email')}
                />
                <FieldError error={errors.email} />
                {watchedEmail?.toLowerCase()?.includes('admin') && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Super Admin uses Passwordless OTP.
                    <button
                      type="button"
                      onClick={() => {
                        setLoginMode('superadmin');
                        setAdminEmail(watchedEmail);
                      }}
                      className="underline hover:text-amber-800 font-semibold ml-1"
                    >
                      Switch to OTP Tab
                    </button>
                  </p>
                )}
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    disabled={isSubmitting}
                    className={`${fieldCls} pr-10`}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <FieldError error={errors.password} />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className={
                  'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 ' +
                  'text-sm font-semibold text-white shadow-sm transition ' +
                  'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 ' +
                  'dark:bg-blue-600 dark:hover:bg-blue-500 ' +
                  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ' +
                  'dark:focus:ring-offset-gray-900 disabled:opacity-60'
                }
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Verifying credentials…' : 'Continue to OTP Verification'}
                {!isSubmitting && <ArrowRight className="h-4 w-4" />}
              </button>

              {/* Customer Register Button */}
              <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 text-center dark:border-blue-900/40 dark:bg-blue-950/30">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                  New to BankShield?
                </p>
                <Link
                  to="/register"
                  className={
                    'flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 ' +
                    'text-xs font-semibold text-blue-700 bg-white border border-blue-200 shadow-sm transition ' +
                    'hover:bg-blue-50 hover:text-blue-800 ' +
                    'dark:bg-slate-800 dark:border-slate-700 dark:text-blue-300 dark:hover:bg-slate-750'
                  }
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Register as a New Customer
                </Link>
              </div>
            </form>
          )}

          {/* Demo Quick Fills for Evaluation (Always accessible on Credentials step) */}
          {step === 'credentials' && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-300">
              <div className="mb-2 flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                  <KeyRound className="h-3.5 w-3.5 text-blue-500" />
                  Quick Fill Test Credentials
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('superadmin');
                    setAdminEmail('superadmin@bankshield.internal');
                  }}
                  className="rounded border border-amber-200 bg-amber-50/80 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 flex items-center justify-center gap-1"
                >
                  <ShieldCheck className="h-3 w-3 text-amber-600" />
                  Super Admin (OTP Only)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('standard');
                    setValue('email', 'analyst@bankshield.in', { shouldValidate: true });
                    setValue('password', 'Analyst@12345!', { shouldValidate: true });
                  }}
                  className="rounded border border-blue-200 bg-blue-50/80 px-2 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
                >
                  Fraud Analyst
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('standard');
                    setValue('email', 'manager@bankshield.internal', { shouldValidate: true });
                    setValue('password', 'BranchManager@2025!', { shouldValidate: true });
                  }}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-700 dark:text-slate-200"
                >
                  Branch Manager
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('standard');
                    setValue('email', 'samdae@email.com', { shouldValidate: true });
                    setValue('password', 'BankShield@Sam2025!', { shouldValidate: true });
                  }}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-700 dark:text-slate-200"
                >
                  Customer
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2: OTP VERIFICATION FORM ───────────────────────────────── */}
          {step === 'otp' && (
            <form onSubmit={onVerifyOtp} className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
                <p className="font-semibold flex items-center gap-1.5 mb-1 text-blue-800 dark:text-blue-300">
                  <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Security Verification Code Dispatched
                </p>
                <p className="text-[11px] leading-relaxed">
                  A 6-digit OTP has been dispatched to <strong className="font-mono text-slate-900 dark:text-slate-100">{userEmail}</strong>.
                  Code expires in <strong>5 minutes</strong>.
                </p>
              </div>

              {/* Dev mode helper chip */}
              {devOtp && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 flex items-center justify-between">
                  <div>
                    <span className="font-semibold">Dev OTP: </span>
                    <span className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300 ml-1">{devOtp}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOtpCode(devOtp)}
                    className="text-[11px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    Auto-fill
                  </button>
                </div>
              )}

              <div>
                <label htmlFor="otpCode" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Enter 6-Digit Code
                </label>
                <input
                  id="otpCode"
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className={`${fieldCls} font-mono text-center text-2xl tracking-widest`}
                  placeholder="••••••"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={isVerifying || otpCode.length !== 6}
                className={
                  'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 ' +
                  'text-sm font-semibold text-white shadow-sm transition ' +
                  'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 ' +
                  'dark:bg-blue-600 dark:hover:bg-blue-500 ' +
                  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ' +
                  'disabled:opacity-60'
                }
              >
                {isVerifying && <Loader2 className="h-4 w-4 animate-spin" />}
                {isVerifying ? 'Verifying OTP…' : 'Verify & Enter Dashboard'}
              </button>

              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                <button
                  type="button"
                  onClick={() => { setStep('credentials'); setOtpCode(''); setApiError(''); }}
                  className="hover:underline text-slate-600 dark:text-slate-300"
                >
                  ← Back to login
                </button>
                <button
                  type="button"
                  disabled={resendCooldown > 0}
                  onClick={handleResend}
                  className="hover:underline text-blue-600 dark:text-blue-400 disabled:opacity-50 flex items-center gap-1"
                >
                  <RotateCw className="h-3 w-3" />
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-600">
          © {new Date().getFullYear()} BankShield · Secure Banking Platform
        </p>
      </div>
    </div>
  );
};

export default Login;
