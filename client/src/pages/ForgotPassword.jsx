/**
 * ForgotPassword.jsx — Request a password-reset link.
 */

import React, { useState } from 'react';
import { Link }         from 'react-router-dom';
import { useForm }      from 'react-hook-form';
import { zodResolver }  from '@hookform/resolvers/zod';
import { z }            from 'zod';
import { ShieldCheck, Loader2, ArrowLeft, Mail } from 'lucide-react';
import { authService }  from '@/services/authService';
import { ErrorMessage, FieldError } from '@/components/ui/ErrorMessage';

const schema = z.object({
  email: z.string().min(1, 'Email is required.').email('Enter a valid email.'),
});

const ForgotPassword = () => {
  const [sent, setSent]         = useState(false);
  const [apiError, setApiError] = useState('');

  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(schema) });

  const onSubmit = async ({ email }) => {
    setApiError('');
    try {
      await authService.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setApiError(err?.response?.data?.error ?? 'Something went wrong. Please try again.');
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
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Forgot Password</h1>
            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              Enter your email and we'll send you a reset link.
            </p>
          </div>

          {sent ? (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-4 text-center dark:border-green-800 dark:bg-green-950/30">
              <Mail className="mx-auto mb-2 h-8 w-8 text-green-500" />
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                Reset link sent!
              </p>
              <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                Check <strong>{getValues('email')}</strong> for the reset link.
                It expires in 15 minutes.
              </p>
            </div>
          ) : (
            <>
              <ErrorMessage message={apiError} onDismiss={() => setApiError('')} className="mb-4" />
              <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                <div>
                  <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@bankshield.in"
                    {...register('email')}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                  />
                  <FieldError message={errors.email?.message} />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>
            </>
          )}

          <div className="mt-5 flex items-center justify-center">
            <Link
              to="/login"
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
