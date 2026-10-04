/**
 * Profile.jsx — /profile
 *
 * Two-tab layout:
 *   • Profile — view + edit (firstName, lastName, phone, avatarUrl)
 *   • Security — change password, active session info
 *
 * APIs:
 *   GET  /api/auth/me         — populated from AuthContext (user object)
 *   PATCH /api/auth/me        — update profile fields
 *   POST  /api/auth/change-password
 *
 * React Hook Form + Zod on both forms.
 * Calls AuthContext.refreshUser() after a successful profile update so the
 * navbar/sidebar picks up the new name immediately.
 */
import React, { useState, useEffect } from 'react';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import {
  User, Lock, Camera, CheckCircle2,
  Loader2, Shield, Mail, Phone, Badge,
} from 'lucide-react';
import toast             from 'react-hot-toast';
import { authService }   from '@/services/authService';
import { useAuth }       from '@/context/AuthContext';
import { Button }        from '@/components/ui/button';
import { Input }         from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { FieldError }    from '@/components/ui/ErrorMessage';

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
    <img src={user.avatarUrl} alt="avatar"
      className={`${dim} rounded-full object-cover ring-2 ring-white shadow-md dark:ring-gray-800`} />
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

// ─────────────────────────────────────────────────────────────────────────────
const Profile = () => {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState('profile');

  // ── Profile form ────────────────────────────────────────────────────────
  const {
    register: regP, handleSubmit: handleP, reset: resetP,
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
      toast.success('Profile updated.');
      resetP(values); // clear dirty flag
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
    { id: 'profile',  label: 'Profile',  Icon: User },
    { id: 'security', label: 'Security', Icon: Lock },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Profile &amp; Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your account details and security preferences.
        </p>
      </div>

      {/* ── Avatar + identity card ────────────────────────────────────────── */}
      <Card>
        <CardContent className="flex items-center gap-5 py-5">
          <div className="relative shrink-0">
            <Avatar user={user} />
            {/* Camera overlay — cosmetic; actual URL update is in the form */}
            <div className="absolute -bottom-1 -right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-blue-600 shadow dark:border-gray-900"
              title="Update avatar URL in the form below">
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
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
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
                  <Input {...regP('firstName')}
                    placeholder="First name"
                    className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                </Field>
                <Field label="Last Name" icon={User} error={errP.lastName?.message}>
                  <Input {...regP('lastName')}
                    placeholder="Last name"
                    className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                </Field>
              </div>

              <Field label="Email" icon={Mail}>
                <Input value={user?.email ?? ''} disabled
                  className="bg-gray-50 cursor-not-allowed dark:bg-gray-800/50 dark:border-gray-700" />
                <p className="mt-1 text-xs text-gray-400">Email cannot be changed here.</p>
              </Field>

              <Field label="Phone" icon={Phone} error={errP.phone?.message}>
                <Input {...regP('phone')}
                  type="tel"
                  placeholder="+91 98765 43210"
                  className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              </Field>

              <Field label="Avatar URL" icon={Camera} error={errP.avatarUrl?.message}>
                <Input {...regP('avatarUrl')}
                  type="url"
                  placeholder="https://example.com/avatar.jpg"
                  className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              </Field>

              {/* Permissions panel */}
              {(user?.permissions ?? []).length > 0 && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Your Permissions ({user.permissions.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {user.permissions.map(p => (
                      <span key={p}
                        className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                        <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
                <Button type="button" variant="outline"
                  disabled={!dirtyP || submittingP}
                  onClick={() => resetP()}>
                  Reset
                </Button>
                <Button type="submit" disabled={!dirtyP || submittingP} className="gap-2">
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
                  <Input {...regPw('currentPassword')}
                    type="password"
                    autoComplete="current-password"
                    placeholder="Your current password"
                    className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                </Field>

                <Field label="New Password" error={errPw.newPassword?.message}>
                  <Input {...regPw('newPassword')}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Min 8 chars · upper · lower · digit · symbol"
                    className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                </Field>

                <Field label="Confirm New Password" error={errPw.confirmPassword?.message}>
                  <Input {...regPw('confirmPassword')}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repeat new password"
                    className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
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
                      <CheckCircle2 className="h-3 w-3 text-gray-300 dark:text-gray-600" />
                      {r}
                    </li>
                  ))}
                </ul>

                <div className="flex justify-end border-t border-gray-100 pt-4 dark:border-gray-800">
                  <Button type="submit" disabled={submittingPw} className="gap-2">
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
                  ['Account',    user?.is_active === false ? 'Inactive' : 'Active'],
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
    </div>
  );
};

export default Profile;
