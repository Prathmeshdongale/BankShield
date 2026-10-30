/**
 * Login.jsx — Unified sign-in page supporting:
 *  1. Normal Customer & Staff login (Password)
 *  2. Super Admin login exclusively via Email OTP
 *  3. Direct registration route for new customers
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import {
  ShieldCheck, Eye, EyeOff, Loader2, KeyRound,
  Mail, ArrowRight, UserPlus, Sparkles, RefreshCw, CheckCircle2
} from 'lucide-react';
import { useAuth }     from '@/context/AuthContext';
import { authService } from '@/services/authService';
import { ErrorMessage, FieldError } from '@/components/ui/ErrorMessage';

const loginSchema = z.object({
  email   : z.string().min(1, 'Email is required.').email('Enter a valid email.'),
  password: z.string().min(1, 'Password is required.'),
});

const Login = () => {
  const { login, loginWithOtp } = useAuth();
  const navigate                = useNavigate();
  const location                = useLocation();
  const from                    = location.state?.from?.pathname ?? '/';

  // Active tab: 'password' (Customer/Staff) | 'superadmin-otp' (Super Admin)
  const [activeTab,    setActiveTab]    = useState('password');
  const [showPw,       setShowPw]       = useState(false);
  const [apiError,     setApiError]     = useState('');
  const [infoMessage,  setInfoMessage]  = useState('');

  // Superadmin OTP State
  const [adminEmail,   setAdminEmail]   = useState('superadmin@bankshield.internal');
  const [otpCode,      setOtpCode]      = useState('');
  const [otpSent,      setOtpSent]      = useState(false);
  const [devOtp,       setDevOtp]       = useState(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
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

  // If user enters superadmin in the password tab, guide them to OTP
  useEffect(() => {
    if (watchedEmail?.trim()?.toLowerCase() === 'superadmin@bankshield.internal' && activeTab === 'password') {
      setInfoMessage('Note: Super Admin must log in using Email OTP. Please switch to the "Super Admin (OTP)" tab above.');
    } else {
      setInfoMessage('');
    }
  }, [watchedEmail, activeTab]);

  // ── Password-based Submit (Customers & Staff) ──────────────────────────────
  const onPasswordSubmit = async ({ email, password }) => {
    setApiError('');
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err?.response?.data?.error) {
        setApiError(err.response.data.error);
        if (err.response.data.error.includes('Super Admin')) {
          setActiveTab('superadmin-otp');
          setAdminEmail(email);
        }
      } else if (!err?.response || err?.code === 'ERR_NETWORK') {
        setApiError('Unable to connect to the backend server (http://localhost:5000). Please ensure the backend is running.');
      } else {
        setApiError('Invalid email or password.');
      }
    }
  };

  // ── Super Admin OTP Handlers ───────────────────────────────────────────────
  const handleSendOtp = async (e) => {
    e?.preventDefault();
    if (!adminEmail) {
      setApiError('Please enter a valid super admin email address.');
      return;
    }
    setApiError('');
    setIsSendingOtp(true);
    try {
      const res = await authService.sendSuperAdminOtp(adminEmail);
      setOtpSent(true);
      setDevOtp(res.data?.devOtp ?? null);
      setResendCooldown(30);
    } catch (err) {
      if (err?.response?.data?.error) {
        setApiError(err.response.data.error);
      } else if (!err?.response || err?.code === 'ERR_NETWORK') {
        setApiError('Unable to connect to the backend server (http://localhost:5000). Please ensure the backend is running.');
      } else {
        setApiError('Failed to send OTP code. Please verify your email.');
      }
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setApiError('Please enter the 6-digit OTP code received.');
      return;
    }
    setApiError('');
    setIsVerifyingOtp(true);
    try {
      await loginWithOtp(adminEmail, otpCode.trim());
      navigate(from, { replace: true });
    } catch (err) {
      if (err?.response?.data?.error) {
        setApiError(err.response.data.error);
      } else {
        setApiError('Invalid or expired OTP code. Please try again.');
      }
    } finally {
      setIsVerifyingOtp(false);
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
              Sign in to your banking & fraud operations account
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="mb-6 flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => { setActiveTab('password'); setApiError(''); }}
              className={`flex-1 rounded-md py-2 text-xs font-semibold transition ${
                activeTab === 'password'
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Customer & Staff
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('superadmin-otp'); setApiError(''); }}
              className={`flex-1 rounded-md py-2 text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                activeTab === 'superadmin-otp'
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Mail className="h-3.5 w-3.5" />
              Super Admin (OTP)
            </button>
          </div>

          <ErrorMessage message={apiError} onDismiss={() => setApiError('')} className="mb-4" />

          {infoMessage && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
              {infoMessage}
            </div>
          )}

          {/* TAB 1: CUSTOMER & STAFF PASSWORD LOGIN */}
          {activeTab === 'password' && (
            <form onSubmit={handleSubmit(onPasswordSubmit)} noValidate className="space-y-4">
              {/* Email */}
              <div>
                <label htmlFor="email"
                  className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Email
                </label>
                <input id="email" type="email" autoComplete="email"
                  placeholder="customer@example.com"
                  {...register('email')}
                  className={fieldCls}
                />
                <FieldError message={errors.email?.message} />
              </div>

              {/* Password */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  <Link to="/forgot-password"
                    className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input id="password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    {...register('password')}
                    className={`${fieldCls} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <FieldError message={errors.password?.message} />
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
                {isSubmitting ? 'Signing in…' : 'Sign In'}
              </button>

              {/* REGISTER BUTTON / LINK */}
              <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 text-center dark:border-blue-900/40 dark:bg-blue-950/30">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                  Don't have a BankShield account yet?
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
                  Register as a New User
                </Link>
              </div>
            </form>
          )}

          {/* TAB 2: SUPER ADMIN OTP LOGIN */}
          {activeTab === 'superadmin-otp' && (
            <div className="space-y-4">
              {!otpSent ? (
                /* STEP 1: Enter Email & Request OTP */
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                    <p className="font-semibold flex items-center gap-1.5 mb-1">
                      <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      Enhanced Security
                    </p>
                    <p className="text-[11px] leading-relaxed">
                      Super Administrator accounts must authenticate exclusively via One-Time Password (OTP) dispatched to email.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="adminEmail"
                      className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Super Admin Email
                    </label>
                    <input
                      id="adminEmail"
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className={fieldCls}
                      placeholder="superadmin@bankshield.internal"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSendingOtp}
                    className={
                      'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 ' +
                      'text-sm font-semibold text-white shadow-sm transition ' +
                      'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 ' +
                      'dark:bg-blue-600 dark:hover:bg-blue-500 ' +
                      'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ' +
                      'disabled:opacity-60'
                    }
                  >
                    {isSendingOtp && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isSendingOtp ? 'Sending OTP…' : 'Send OTP to Email'}
                  </button>
                </form>
              ) : (
                /* STEP 2: Enter OTP & Verify */
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
                    <p className="font-semibold flex items-center gap-1.5 mb-0.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Verification Code Dispatched
                    </p>
                    <p className="text-[11px]">
                      A 6-digit OTP code has been sent to <strong className="font-mono">{adminEmail}</strong>.
                    </p>
                  </div>

                  {/* Dev mode helper chip */}
                  {devOtp && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-200 flex items-center justify-between">
                      <div>
                        <span className="font-semibold">Dev OTP: </span>
                        <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-300 ml-1">{devOtp}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOtpCode(devOtp)}
                        className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Auto-fill
                      </button>
                    </div>
                  )}

                  <div>
                    <label htmlFor="otpCode"
                      className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Enter 6-Digit OTP
                    </label>
                    <input
                      id="otpCode"
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      className={`${fieldCls} font-mono text-center text-lg tracking-widest`}
                      placeholder="••••••"
                      autoFocus
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isVerifyingOtp || otpCode.length !== 6}
                    className={
                      'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 ' +
                      'text-sm font-semibold text-white shadow-sm transition ' +
                      'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 ' +
                      'dark:bg-blue-600 dark:hover:bg-blue-500 ' +
                      'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ' +
                      'disabled:opacity-60'
                    }
                  >
                    {isVerifyingOtp && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isVerifyingOtp ? 'Verifying…' : 'Verify & Sign In'}
                  </button>

                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                    <button
                      type="button"
                      onClick={() => { setOtpSent(false); setOtpCode(''); }}
                      className="hover:underline text-slate-600 dark:text-slate-300"
                    >
                      Change email
                    </button>
                    <button
                      type="button"
                      disabled={resendCooldown > 0 || isSendingOtp}
                      onClick={handleSendOtp}
                      className="hover:underline text-blue-600 dark:text-blue-400 disabled:opacity-50"
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                    </button>
                  </div>
                </form>
              )}
            </div>
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
