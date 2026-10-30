/**
 * Register.jsx — Customer self-registration page with instant account creation
 * and strict 12+ character password policy & OTP verification.
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import {
  ShieldCheck, Eye, EyeOff, Loader2, CheckCircle2, ArrowRight,
  Mail, Sparkles
} from 'lucide-react';
import { useAuth }     from '@/context/AuthContext';
import { ErrorMessage, FieldError } from '@/components/ui/ErrorMessage';
import PasswordStrengthIndicator, { checkPasswordRules } from '@/components/auth/PasswordStrengthIndicator';

const schema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(50, 'Max 50 characters.'),
  lastName:  z.string().trim().min(1, 'Last name is required.').max(50, 'Max 50 characters.'),
  email:     z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.'),
  phone:     z.string().optional().refine((val) => !val || /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/.test(val), {
    message: 'Enter a valid phone number.',
  }),
  password:  z.string()
    .min(12, 'Password must be at least 12 characters.')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{};:'",.<>/?\\|`~])/, 
      'Must contain uppercase, lowercase, number, and special character.'
    ),
  confirmPassword: z.string().min(1, 'Please confirm your password.'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
});

const Register = () => {
  const { registerCustomer, verifyLoginOtp, resendOtp } = useAuth();
  const navigate                         = useNavigate();
  const [showPw, setShowPw]               = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [apiError, setApiError]           = useState('');

  // OTP Verification state
  const [pendingOtp, setPendingOtp]       = useState(false);
  const [userEmail, setUserEmail]         = useState('');
  const [otpCode, setOtpCode]             = useState('');
  const [devOtp, setDevOtp]               = useState(null);
  const [isVerifying, setIsVerifying]     = useState(false);
  const [isResending, setIsResending]     = useState(false);

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(schema), mode: 'onChange' });

  const watchedPassword = watch('password') || '';
  const watchedConfirmPassword = watch('confirmPassword') || '';

  const onSubmit = async ({ firstName, lastName, email, phone, password }) => {
    setApiError('');
    try {
      const res = await registerCustomer({
        firstName,
        lastName,
        email,
        phone: phone || null,
        password,
      });

      if (res?.requiresOtp) {
        setUserEmail(res.email);
        setDevOtp(res.devOtp ?? null);
        setPendingOtp(true);
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      if (err?.response?.data?.error) {
        setApiError(err.response.data.error);
      } else if (!err?.response || err?.code === 'ERR_NETWORK') {
        setApiError('Unable to connect to backend server. Please verify that the server is running on http://localhost:5000.');
      } else {
        setApiError('Registration failed. Please review your information and try again.');
      }
    }
  };

  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setApiError('Please enter the 6-digit verification code.');
      return;
    }
    setApiError('');
    setIsVerifying(true);
    try {
      await verifyLoginOtp(userEmail, otpCode.trim());
      navigate('/', { replace: true });
    } catch (err) {
      if (err?.response?.data?.error) {
        setApiError(err.response.data.error);
      } else {
        setApiError('Invalid or expired verification code.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    setIsResending(true);
    try {
      const res = await resendOtp(userEmail);
      if (res?.devOtp) setDevOtp(res.devOtp);
    } catch (err) {
      setApiError(err?.response?.data?.error ?? 'Failed to resend code.');
    } finally {
      setIsResending(false);
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
      <div className="w-full max-w-lg">

        {/* Card */}
        <div className={
          'rounded-2xl border p-8 shadow-xl ' +
          'border-slate-200 bg-white ' +
          'dark:border-slate-700/50 dark:bg-gray-900'
        }>
          {/* Header */}
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/30">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {pendingOtp ? 'Verify Your Account' : 'Create Customer Account'}
            </h1>
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              {pendingOtp
                ? `Enter the 6-digit code sent to ${userEmail}`
                : 'Open your secure fraud-monitored banking account'}
            </p>
          </div>

          <ErrorMessage message={apiError} onDismiss={() => setApiError('')} className="mb-4" />

          {/* OTP Verification Step */}
          {pendingOtp ? (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
                <p className="font-semibold flex items-center gap-1.5 mb-1">
                  <Mail className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  Verification Code Dispatched
                </p>
                <p className="text-[11px] leading-relaxed">
                  We sent a single-use 6-digit verification code to <strong className="font-mono">{userEmail}</strong>.
                  Code expires in 5 minutes.
                </p>
              </div>

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
                <label htmlFor="otp" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  6-Digit OTP Code
                </label>
                <input
                  id="otp"
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className={`${fieldCls} font-mono text-center text-xl tracking-widest`}
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
                {isVerifying ? 'Activating account…' : 'Verify & Enter Dashboard'}
              </button>

              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingOtp(false)}
                  className="hover:underline text-slate-600 dark:text-slate-300"
                >
                  Edit details
                </button>
                <button
                  type="button"
                  disabled={isResending}
                  onClick={handleResendOtp}
                  className="hover:underline text-blue-600 dark:text-blue-400 disabled:opacity-50"
                >
                  {isResending ? 'Sending…' : 'Resend Code'}
                </button>
              </div>
            </form>
          ) : (
            /* Registration Details Step */
            <>
              {/* Security Banner */}
              <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-200">
                <p className="font-semibold text-blue-800 dark:text-blue-300 mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Fraud-monitored banking features:
                </p>
                <ul className="grid grid-cols-2 gap-1 text-[11px] text-slate-600 dark:text-slate-300 pl-5 list-disc">
                  <li>Active savings account</li>
                  <li>Real-time XGBoost fraud guard</li>
                  <li>Transaction risk indicators</li>
                  <li>Security alerts dashboard</li>
                </ul>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                {/* First & Last Name */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="firstName" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="firstName"
                      type="text"
                      placeholder="John"
                      {...register('firstName')}
                      className={fieldCls}
                    />
                    <FieldError message={errors.firstName?.message} />
                  </div>

                  <div>
                    <label htmlFor="lastName" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="lastName"
                      type="text"
                      placeholder="Doe"
                      {...register('lastName')}
                      className={fieldCls}
                    />
                    <FieldError message={errors.lastName?.message} />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="john.doe@example.com"
                    {...register('email')}
                    className={fieldCls}
                  />
                  <FieldError message={errors.email?.message} />
                </div>

                {/* Phone */}
                <div>
                  <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Phone Number <span className="text-xs text-slate-400">(Optional)</span>
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    placeholder="+91 98765 43210"
                    {...register('phone')}
                    className={fieldCls}
                  />
                  <FieldError message={errors.phone?.message} />
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="••••••••••••"
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

                {/* Confirm Password */}
                <div>
                  <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirmPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="••••••••••••"
                      {...register('confirmPassword')}
                      className={`${fieldCls} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw(v => !v)}
                      aria-label={showConfirmPw ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                    >
                      {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <FieldError message={errors.confirmPassword?.message} />
                </div>

                {/* Interactive Password Policy Meter */}
                <PasswordStrengthIndicator
                  password={watchedPassword}
                  confirmPassword={watchedConfirmPassword}
                />

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={
                    'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 mt-4 ' +
                    'text-sm font-semibold text-white shadow-sm transition ' +
                    'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 ' +
                    'dark:bg-blue-600 dark:hover:bg-blue-500 ' +
                    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ' +
                    'dark:focus:ring-offset-gray-900 disabled:opacity-60'
                  }
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Creating account…' : 'Create Account & Continue'}
                </button>
              </form>

              {/* Back to sign in */}
              <div className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-4 text-center text-sm text-slate-500 dark:text-slate-400">
                Already registered?{' '}
                <Link
                  to="/login"
                  className="font-semibold text-blue-600 hover:underline dark:text-blue-400 inline-flex items-center gap-1"
                >
                  Sign in here <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-600">
          © {new Date().getFullYear()} BankShield · Secure Banking Platform
        </p>
      </div>
    </div>
  );
};

export default Register;
