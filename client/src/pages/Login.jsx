/**
 * Login.jsx — Sign-in page, full light + dark mode.
 */
import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import { ShieldCheck, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth }     from '@/context/AuthContext';
import { ErrorMessage, FieldError } from '@/components/ui/ErrorMessage';

const schema = z.object({
  email   : z.string().min(1, 'Email is required.').email('Enter a valid email.'),
  password: z.string().min(1, 'Password is required.'),
});

const Login = () => {
  const { login }    = useAuth();
  const navigate     = useNavigate();
  const location     = useLocation();
  const from         = location.state?.from?.pathname ?? '/';
  const [showPw,     setShowPw]   = useState(false);
  const [apiError,   setApiError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(schema) });

  const onSubmit = async ({ email, password }) => {
    setApiError('');
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setApiError(err?.response?.data?.error ?? 'Invalid email or password.');
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
      <div className="w-full max-w-sm">

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
              Sign in to your fraud operations account
            </p>
          </div>

          <ErrorMessage message={apiError} onDismiss={() => setApiError('')} className="mb-4" />

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Email
              </label>
              <input id="email" type="email" autoComplete="email"
                placeholder="analyst@bankshield.in"
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
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-600">
          © {new Date().getFullYear()} BankShield · Secure Banking Platform
        </p>
      </div>
    </div>
  );
};

export default Login;
