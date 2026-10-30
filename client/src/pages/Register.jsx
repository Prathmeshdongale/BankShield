/**
 * Register.jsx — Customer self-registration page with instant account creation.
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import { ShieldCheck, Eye, EyeOff, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';
import { useAuth }     from '@/context/AuthContext';
import { ErrorMessage, FieldError } from '@/components/ui/ErrorMessage';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required.').max(50, 'Max 50 characters.'),
  lastName:  z.string().min(1, 'Last name is required.').max(50, 'Max 50 characters.'),
  email:     z.string().min(1, 'Email is required.').email('Enter a valid email address.'),
  phone:     z.string().optional().refine((val) => !val || /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/.test(val), {
    message: 'Enter a valid phone number.',
  }),
  password:  z.string()
    .min(8, 'Password must be at least 8 characters.')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{};:'",.<>/?\\|`~])/, 
      'Must contain uppercase, lowercase, number, and special character.'
    ),
  confirmPassword: z.string().min(1, 'Please confirm your password.'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
});

const Register = () => {
  const { registerCustomer } = useAuth();
  const navigate             = useNavigate();
  const [showPw, setShowPw]   = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [apiError, setApiError]           = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(schema) });

  const onSubmit = async ({ firstName, lastName, email, phone, password }) => {
    setApiError('');
    try {
      await registerCustomer({
        firstName,
        lastName,
        email,
        phone: phone || null,
        password,
      });
      navigate('/', { replace: true });
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
              Create your <span className="text-blue-600 dark:text-blue-400">BankShield</span> account
            </h1>
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              Open your secure personal banking account in seconds
            </p>
          </div>

          <ErrorMessage message={apiError} onDismiss={() => setApiError('')} className="mb-4" />

          {/* Benefits banner */}
          <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-200">
            <p className="font-semibold text-blue-800 dark:text-blue-300 mb-1 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Included with your new account:
            </p>
            <ul className="grid grid-cols-2 gap-1 text-[11px] text-slate-600 dark:text-slate-300 pl-5 list-disc">
              <li>Instant active Savings account</li>
              <li>₹25,000 demo initial deposit</li>
              <li>Real-time XGBoost fraud guard</li>
              <li>Customer self-service dashboard</li>
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
                  placeholder="••••••••"
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

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={
                'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 mt-2 ' +
                'text-sm font-semibold text-white shadow-sm transition ' +
                'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 ' +
                'dark:bg-blue-600 dark:hover:bg-blue-500 ' +
                'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ' +
                'dark:focus:ring-offset-gray-900 disabled:opacity-60'
              }
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Creating your account…' : 'Create Account'}
            </button>
          </form>

          {/* Back to sign in */}
          <div className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-4 text-center text-sm text-slate-500 dark:text-slate-400">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-semibold text-blue-600 hover:underline dark:text-blue-400 inline-flex items-center gap-1"
            >
              Sign in here <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-600">
          © {new Date().getFullYear()} BankShield · Secure Banking Platform
        </p>
      </div>
    </div>
  );
};

export default Register;
