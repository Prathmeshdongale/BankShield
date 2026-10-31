/**
 * Profile.jsx — /profile
 *
 * Two-tab layout:
 *   • Profile — view + edit (firstName, lastName, phone, avatarUrl)
 *   • Security — change password, active session info
 *
 * Features:
 *   • Interactive SVG Profile Completion Metric Pie Chart / Donut Chart
 *   • Dynamic checklist of security & profile attributes
 *   • Calls AuthContext.refreshUser() after successful update
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  User, Lock, Camera, CheckCircle2,
  Loader2, Shield, Mail, Phone, Badge,
  AlertCircle, Check, ArrowRight, ShieldCheck, KeyRound
} from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '@/services/authService';
import { useAuth } from '@/context/AuthContext';
import SecurityOtpVerification from '@/pages/portal/SecurityOtpVerification';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { FieldError } from '@/components/ui/ErrorMessage';

// ── Zod schemas ───────────────────────────────────────────────────────────────
const profileSchema = z.object({
  firstName : z.string().trim().min(1, 'First name is required.').max(60),
  lastName  : z.string().trim().min(1, 'Last name is required.').max(60),
  phone     : z.string().trim().optional().refine(
    v => !v || /^\+?[\d\s\-()]{7,20}$/.test(v),
    { message: 'Enter a valid phone number.' }
  ),
  avatarUrl : z.string().trim().optional().refine(
    v => !v || v.startsWith('http'),
    { message: 'Must be a valid URL starting with http.' }
  ),
});

const passwordSchema = z.object({
  currentPassword : z.string().min(1, 'Current password is required.'),
  newPassword     : z.string()
    .min(8,  'Password must be at least 8 characters.')
    .regex(/[A-Z]/, 'Must contain an uppercase letter.')
    .regex(/[a-z]/, 'Must contain a lowercase letter.')
    .regex(/\d/,    'Must contain a digit.')
    .regex(/[^A-Za-z0-9]/, 'Must contain a special character.'),
  confirmPassword : z.string().min(1, 'Please confirm your new password.'),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match.',
  path   : ['confirmPassword'],
});

// ── tiny field-row wrapper ────────────────────────────────────────────────────
const Field = ({ label, icon: Icon, children, error }) => (
  <div>
    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </label>
    {children}
    <FieldError message={error} />
  </div>
);

// ── avatar initials fallback ──────────────────────────────────────────────────
const Avatar = ({ user, size = 'lg' }) => {
  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';
  const dim = size === 'lg' ? 'h-20 w-20 text-2xl' : 'h-10 w-10 text-sm';
  return user?.avatarUrl ? (
    <img
      src={user.avatarUrl}
      alt="avatar"
      className={`${dim} rounded-full object-cover ring-2 ring-white shadow-md dark:ring-gray-800`}
    />
  ) : (
    <div className={`${dim} flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 font-bold text-white ring-2 ring-white shadow-md dark:ring-gray-800`}>
      {initials}
    </div>
  );
};

// ── role display name ─────────────────────────────────────────────────────────
const ROLE_LABELS = {
  super_admin        : 'Super Admin',
  admin              : 'Admin',
  compliance_officer : 'Compliance Officer',
  fraud_analyst      : 'Fraud Analyst',
  branch_manager     : 'Branch Manager',
  teller             : 'Teller',
  customer           : 'Customer',
};

// ── Profile Completion Metric Pie Chart ───────────────────────────────────────
const ProfileCompletionMetric = ({ user, onFocusField }) => {
  const items = useMemo(() => [
    {
      id: 'name',
      label: 'Full Name',
      desc: 'First and last name provided',
      weight: 20,
      completed: Boolean(user?.firstName?.trim() && user?.lastName?.trim()),
    },
    {
      id: 'email',
      label: 'Verified Email',
      desc: 'Registered communication email',
      weight: 20,
      completed: Boolean(user?.email?.trim()),
    },
    {
      id: 'phone',
      label: 'Phone Number',
      desc: 'Required for security OTPs',
      weight: 20,
      completed: Boolean(user?.phone?.trim()),
      actionField: 'phone',
    },
    {
      id: 'mfa',
      label: 'Multi-Factor OTP',
      desc: '2-step cryptographic login verification',
      weight: 15,
      completed: true, // All BankShield accounts enforce 2FA OTP
    },
    {
      id: 'avatar',
      label: 'Profile Photo',
      desc: 'Personalized account photo URL',
      weight: 15,
      completed: Boolean(user?.avatarUrl?.trim()),
      actionField: 'avatarUrl',
    },
    {
      id: 'password',
      label: 'Strong Password',
      desc: 'Encrypted hash with special characters',
      weight: 10,
      completed: true,
    },
  ], [user]);

  const percentage = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.completed ? item.weight : 0), 0);
  }, [items]);

  // SVG Donut calculation (radius 40, circumference 2 * PI * 40 ≈ 251.327)
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const colorClass =
    percentage >= 90 ? 'text-emerald-500' :
    percentage >= 70 ? 'text-blue-600' :
    percentage >= 50 ? 'text-amber-500' : 'text-rose-500';

  const badgeConfig =
    percentage === 100
      ? { label: 'Fully Completed', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' }
      : percentage >= 70
      ? { label: 'Good Security Profile', bg: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' }
      : { label: 'Needs Attention', bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' };

  return (
    <Card className="overflow-hidden border-blue-100 shadow-sm dark:border-blue-950/40">
      <CardHeader className="bg-gradient-to-r from-blue-50/60 via-indigo-50/40 to-slate-50/20 pb-3 pt-4 dark:from-blue-950/20 dark:via-indigo-950/20 dark:to-slate-900/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            Security Profile Completion
          </CardTitle>
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeConfig.bg}`}>
            {badgeConfig.label}
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="flex flex-col sm:flex-row items-center gap-6">

          {/* ── Metric Pie / Donut Chart ── */}
          <div className="relative flex flex-col items-center justify-center shrink-0">
            <svg className="h-28 w-28 -rotate-90 transform" viewBox="0 0 90 90">
              {/* Background Ring */}
              <circle
                cx="45"
                cy="45"
                r={radius}
                className="text-gray-100 dark:text-gray-800"
                strokeWidth="8"
                stroke="currentColor"
                fill="transparent"
              />
              {/* Animated Progress Ring */}
              <circle
                cx="45"
                cy="45"
                r={radius}
                className={`${colorClass} transition-all duration-1000 ease-out`}
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
              />
            </svg>

            {/* Percentage Label Inside Donut */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                {percentage}%
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                Completed
              </span>
            </div>
          </div>

          {/* ── Checklist Breakdown ── */}
          <div className="flex-1 w-full space-y-2">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">
              Profile Verification Criteria:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between rounded-lg border p-2 transition ${
                    item.completed
                      ? 'border-emerald-100 bg-emerald-50/40 text-emerald-950 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300'
                      : 'border-amber-200/80 bg-amber-50/50 text-amber-950 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {item.completed ? (
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    ) : (
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
                        <AlertCircle className="h-2.5 w-2.5" />
                      </span>
                    )}
                    <span className="font-medium truncate">{item.label}</span>
                  </div>

                  <span className="text-[10px] font-mono opacity-80 shrink-0 ml-1">
                    +{item.weight}%
                  </span>
                </div>
              ))}
            </div>

            {percentage < 100 && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 pt-1">
                Tip: Complete your phone number and avatar photo below to reach <strong>100%</strong> verification.
              </p>
            )}
          </div>

        </div>
      </CardContent>
    </Card>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
const Profile = () => {
  const { user, refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'profile');

  // ── Profile form ────────────────────────────────────────────────────────
  const {
    register: regP, handleSubmit: handleP, reset: resetP, setFocus: focusP,
    formState: { errors: errP, isSubmitting: submittingP, isDirty: dirtyP },
  } = useForm({
    resolver     : zodResolver(profileSchema),
    defaultValues: {
      firstName : user?.firstName ?? '',
      lastName  : user?.lastName  ?? '',
      phone     : user?.phone     ?? '',
      avatarUrl : user?.avatarUrl ?? '',
    },
  });

  // Sync form defaults when user object arrives / changes
  useEffect(() => {
    if (user) {
      resetP({
        firstName : user.firstName ?? '',
        lastName  : user.lastName  ?? '',
        phone     : user.phone     ?? '',
        avatarUrl : user.avatarUrl ?? '',
      });
    }
  }, [user, resetP]);

  const saveProfile = async (values) => {
    try {
      const payload = { firstName: values.firstName, lastName: values.lastName };
      if (values.phone)     payload.phone     = values.phone;
      if (values.avatarUrl) payload.avatarUrl = values.avatarUrl;

      await authService.updateProfile(payload);
      await refreshUser();
      toast.success('Profile updated successfully.');
      resetP(values);
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Failed to update profile.');
    }
  };

  // ── Password form ────────────────────────────────────────────────────────
  const {
    register: regPw, handleSubmit: handlePw, reset: resetPw,
    formState: { errors: errPw, isSubmitting: submittingPw },
  } = useForm({ resolver: zodResolver(passwordSchema) });

  const changePassword = async ({ currentPassword, newPassword, confirmPassword }) => {
    try {
      await authService.changePassword(currentPassword, newPassword, confirmPassword);
      toast.success('Password changed successfully.');
      resetPw();
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Failed to change password.');
    }
  };

  const tabs = [
    { id: 'profile',  label: 'Personal Profile',       Icon: User },
    { id: 'security', label: 'Password & Auth',        Icon: Lock },
    { id: 'otp',      label: 'OTP & 2FA Verification', Icon: KeyRound },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Security Profile &amp; Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your account verification, security preferences, and identity information.
        </p>
      </div>

      {/* ── Metric Pie Chart Card ────────────────────────────────────────── */}
      <ProfileCompletionMetric
        user={user}
        onFocusField={(field) => {
          if (field === 'otp' || field === 'mfa') {
            setTab('otp');
          } else if (field === 'password') {
            setTab('security');
          } else {
            setTab('profile');
            setTimeout(() => focusP(field), 100);
          }
        }}
      />

      {/* ── Avatar + identity card ────────────────────────────────────────── */}
      <Card>
        <CardContent className="flex items-center gap-5 py-5">
          <div className="relative shrink-0">
            <Avatar user={user} />
            <div
              className="absolute -bottom-1 -right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-blue-600 shadow dark:border-gray-900"
              title="Update avatar URL in the form below"
            >
              <Camera className="h-3 w-3 text-white" />
            </div>
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
                <Shield className="h-3 w-3" />
                {ROLE_LABELS[user?.role] ?? user?.role ?? '—'}
              </span>
              {user?.branch_id && (
                <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                  <Badge className="h-3 w-3" /> Branch linked
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Profile tab ───────────────────────────────────────────────────── */}
      {tab === 'profile' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personal Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleP(saveProfile)} className="space-y-4">

              <div className="grid grid-cols-2 gap-4">
                <Field label="First Name" icon={User} error={errP.firstName?.message}>
                  <Input
                    {...regP('firstName')}
                    placeholder="First name"
                    className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </Field>
                <Field label="Last Name" icon={User} error={errP.lastName?.message}>
                  <Input
                    {...regP('lastName')}
                    placeholder="Last name"
                    className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </Field>
              </div>

              <Field label="Email" icon={Mail}>
                <Input
                  value={user?.email ?? ''}
                  disabled
                  className="bg-gray-50 cursor-not-allowed dark:bg-gray-800/50 dark:border-gray-700"
                />
                <p className="mt-1 text-xs text-gray-400">Email is linked to your authentication identifier.</p>
              </Field>

              <Field label="Phone" icon={Phone} error={errP.phone?.message}>
                <Input
                  {...regP('phone')}
                  type="tel"
                  placeholder="+91 98765 43210"
                  className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              </Field>

              <Field label="Avatar URL" icon={Camera} error={errP.avatarUrl?.message}>
                <Input
                  {...regP('avatarUrl')}
                  type="url"
                  placeholder="https://example.com/photo.jpg"
                  className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              </Field>

              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!dirtyP || submittingP}
                  onClick={() => resetP()}
                >
                  Reset
                </Button>
                <Button type="submit" disabled={!dirtyP || submittingP} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                  {submittingP && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Security tab ──────────────────────────────────────────────────── */}
      {tab === 'security' && (
        <div className="space-y-4">

          {/* Change password */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4 text-gray-500" /> Change Password
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePw(changePassword)} className="space-y-4">

                <Field label="Current Password" error={errPw.currentPassword?.message}>
                  <Input
                    {...regPw('currentPassword')}
                    type="password"
                    autoComplete="current-password"
                    placeholder="Your current password"
                    className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </Field>

                <Field label="New Password" error={errPw.newPassword?.message}>
                  <Input
                    {...regPw('newPassword')}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Min 8 chars · upper · lower · digit · symbol"
                    className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </Field>

                <Field label="Confirm New Password" error={errPw.confirmPassword?.message}>
                  <Input
                    {...regPw('confirmPassword')}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repeat new password"
                    className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </Field>

                {/* Password requirements hint */}
                <ul className="space-y-0.5 rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-800/40">
                  {[
                    'At least 8 characters',
                    'One uppercase letter (A–Z)',
                    'One lowercase letter (a–z)',
                    'One digit (0–9)',
                    'One special character (!@#$…)',
                  ].map(r => (
                    <li key={r} className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      {r}
                    </li>
                  ))}
                </ul>

                <div className="flex justify-end border-t border-gray-100 pt-4 dark:border-gray-800">
                  <Button type="submit" disabled={submittingPw} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                    {submittingPw && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Update Password
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Session info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4 text-gray-500" /> Account Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                {[
                  ['User ID',    user?.id],
                  ['Email',      user?.email],
                  ['Role',       ROLE_LABELS[user?.role] ?? user?.role],
                  ['Account Status', user?.is_active === false ? 'Inactive' : 'Active & Verified'],
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-3">
                    <dt className="w-28 shrink-0 text-xs font-medium text-gray-500">{label}</dt>
                    <dd className={`break-all text-xs ${
                      label === 'User ID' ? 'font-mono text-gray-500' : 'text-gray-800 dark:text-gray-200'
                    }`}>
                      {value ?? '—'}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── OTP & 2FA Verification tab ────────────────────────────────────── */}
      {tab === 'otp' && (
        <div className="space-y-4">
          <SecurityOtpVerification />
        </div>
      )}
    </div>
  );
};

export default Profile;
