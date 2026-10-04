/**
 * ResetPassword.jsx — Consume a reset token and set a new password.
 * Token is read from the URL query string: /reset-password?token=<hex>
 */

import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm }      from 'react-hook-form';
import { zodResolver }  from '@hookform/resolvers/zod';
import { z }            from 'zod';
import { ShieldCheck, Eye, EyeOff, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { authService }  from '@/services/authService';
import { ErrorMessage, FieldError } from '@/components/ui/ErrorMessage';

const PW_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{};:'",.<>/?\\|`~]).{8,}$/;

const schema = z
  .object({
    newPassword    : z.string().regex(PW_REGEX, 'Must be 8+ chars with uppercase, lowercase, number and special character.'),
    confirmPassword: z.string().min(1, 'Please confirm your password.'),
  })
  .refine(d => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match.',
    path   : ['confirmPassword'],
  });

const ResetPassword = () => {
  const navigate              = useNavigate();
  const [params]              = useSearchParams();
  const token                 = params.get('token') ?? '';
  const [done, setDone]       = useState(false);
  const [apiError, setApiError] = useState('');
  const [showPw, setShowPw]   = useState(false);
  const [showCf, setShowCf]   = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(schema) });

  const onSubmit = async ({ newPassword, confirmPassword }) => {
    setApiError('');
    if (!token) { setApiError('Reset token is missing. Please use the link from your email.'); return; }
    try {
      await authService.resetPassword(token, newPassword, confirmPassword);
      setDone(true);
    } catch (err) {
      setApiError(err?.response?.data?.error ?? 'Reset failed — the link may have expired.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4 dark:from-gray-950 dark:to-gray-900">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-800 dark:bg-gray-900">
          {/* Logo */}
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Reset Password</h1>
            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              Choose a new password for your account.
            </p>
          </div>

          {done ? (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-5 text-center dark:border-green-800 dark:bg-green-950/30">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-500" />
              <p className="text-sm font-medium text-green-800 dark:text-green-300">Password reset successfully!</p>
              <p className="mt-1 text-xs text-green-600 dark:text-green-400">You can now sign in with your new password.</p>
              <button
                onClick={() => navigate('/login')}
                className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Go to Sign In
              </button>
            </div>
          ) : (
            <>
              {!token && (
                <ErrorMessage
                  message="No reset token found. Please use the link from your email."
                  className="mb-4"
                />
              )}
              <ErrorMessage message={apiError} onDismiss={() => setApiError('')} className="mb-4" />

              <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                {/* New password */}
                <div>
                  <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      id="newPassword"
                      type={showPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      {...register('newPassword')}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      aria-label={showPw ? 'Hide' : 'Show'}>
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <FieldError message={errors.newPassword?.message} />
                </div>

                {/* Confirm password */}
                <div>
                  <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showCf ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      {...register('confirmPassword')}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                    />
                    <button type="button" onClick={() => setShowCf(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      aria-label={showCf ? 'Hide' : 'Show'}>
                      {showCf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <FieldError message={errors.confirmPassword?.message} />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !token}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Resetting…' : 'Reset Password'}
                </button>
              </form>
            </>
          )}

          <div className="mt-5 flex items-center justify-center">
            <Link to="/login" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
