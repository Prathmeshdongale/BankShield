import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import { ThemeProvider }  from '@/context/ThemeContext';
import { AuthProvider }   from '@/context/AuthContext';
import ProtectedRoute     from '@/components/auth/ProtectedRoute';
import AppLayout          from '@/components/layout/AppLayout';
import { InlineLoader }   from '@/components/ui/LoadingOverlay';

import Login          from '@/pages/Login';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword  from '@/pages/ResetPassword';
import Unauthorized   from '@/pages/Unauthorized';

// ── Implemented pages ─────────────────────────────────────────────────────────
const Dashboard      = lazy(() => import('@/pages/Dashboard'));
const Transactions   = lazy(() => import('@/pages/Transactions'));
const FraudAlerts    = lazy(() => import('@/pages/FraudAlerts'));
const Transfer       = lazy(() => import('@/pages/Transfer'));
const CustomerList   = lazy(() => import('@/pages/customers/CustomerList'));
const CustomerDetail = lazy(() => import('@/pages/customers/CustomerDetail'));
const AccountList    = lazy(() => import('@/pages/accounts/AccountList'));
const AccountDetail  = lazy(() => import('@/pages/accounts/AccountDetail'));
const CardDetail     = lazy(() => import('@/pages/cards/CardDetail'));

// ── Fraud ─────────────────────────────────────────────────────────────────────
const Investigations = lazy(() => import('@/pages/fraud/InvestigationList'));

// ── Reports & Audit ───────────────────────────────────────────────────────────
const Reports        = lazy(() => import('@/pages/reports/Reports'));
const AuditLogs      = lazy(() => import('@/pages/reports/AuditLogs'));

// ── Profile ───────────────────────────────────────────────────────────────────
const Profile        = lazy(() => import('@/pages/profile/Profile'));

// ── Customer portal ───────────────────────────────────────────────────────────
const CustomerHome      = lazy(() => import('@/pages/portal/CustomerHome'));
const MyAccounts        = lazy(() => import('@/pages/portal/MyAccounts'));
const MyAccountDetail   = lazy(() => import('@/pages/portal/MyAccountDetail'));
const MyCards           = lazy(() => import('@/pages/portal/MyCards'));
const MyTransactions    = lazy(() => import('@/pages/portal/MyTransactions'));
const MyAlerts          = lazy(() => import('@/pages/portal/MyAlerts'));

// ── Remaining placeholders ────────────────────────────────────────────────────
const Branches       = lazy(() => import('@/pages/branches/Branches'));
const Notifications  = lazy(() => import('@/pages/Notifications'));

const PageLoader = () => (
  <div className="flex h-64 items-center justify-center">
    <InlineLoader label="Loading…" />
  </div>
);

const S = ({ children }) => <Suspense fallback={<PageLoader />}>{children}</Suspense>;

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" gutter={8} toastOptions={{
            duration: 4000,
            style: {
              borderRadius: '10px',
              background  : 'var(--color-surface)',
              color       : 'var(--color-text)',
              border      : '1px solid var(--color-border)',
              fontSize    : '14px',
              boxShadow   : '0 4px 12px rgba(0,0,0,0.1)',
            },
            success: { iconTheme: { primary: '#16a34a', secondary: '#fff' } },
            error  : { iconTheme: { primary: '#dc2626', secondary: '#fff' } },
          }} />

          <Routes>
            {/* Public */}
            <Route path="/login"           element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password"  element={<ResetPassword />} />
            <Route path="/unauthorized"    element={<Unauthorized />} />

            {/* Protected — all authenticated users */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route index                    element={<S><Dashboard    /></S>} />
                <Route path="transactions"      element={<S><Transactions /></S>} />
                <Route path="accounts"          element={<S><AccountList  /></S>} />
                <Route path="accounts/:id"      element={<S><AccountDetail /></S>} />
                <Route path="cards"             element={<S><AccountList  /></S>} />
                <Route path="cards/:id"         element={<S><CardDetail   /></S>} />
                <Route path="transfer"          element={<S><Transfer     /></S>} />
                <Route path="notifications"     element={<S><Notifications /></S>} />
                <Route path="reports"           element={<S><Reports      /></S>} />
                <Route path="profile"           element={<S><Profile      /></S>} />

                {/* Audit logs — compliance_officer, fraud_analyst, admin, super_admin */}
                <Route element={<ProtectedRoute roles={['super_admin','admin','compliance_officer','fraud_analyst']} />}>
                  <Route path="audit-logs"      element={<S><AuditLogs   /></S>} />
                </Route>

                {/* Branch staff */}
                <Route element={<ProtectedRoute roles={['super_admin','admin','compliance_officer','fraud_analyst','branch_manager','teller']} />}>
                  <Route path="customers"       element={<S><CustomerList   /></S>} />
                  <Route path="customers/:id"   element={<S><CustomerDetail /></S>} />
                  <Route path="fraud/alerts"    element={<S><FraudAlerts    /></S>} />
                </Route>

                {/* Managers */}
                <Route element={<ProtectedRoute roles={['super_admin','admin','branch_manager']} />}>
                  <Route path="branches"        element={<S><Branches /></S>} />
                </Route>

                {/* Analysts */}
                <Route element={<ProtectedRoute roles={['super_admin','admin','compliance_officer','fraud_analyst']} />}>
                  <Route path="fraud/investigations" element={<S><Investigations /></S>} />
                </Route>

                {/* ── Customer portal — all authenticated users (server scopes data) */}
                <Route path="portal"                 element={<S><CustomerHome    /></S>} />
                <Route path="portal/accounts"        element={<S><MyAccounts      /></S>} />
                <Route path="portal/accounts/:id"    element={<S><MyAccountDetail /></S>} />
                <Route path="portal/cards"           element={<S><MyCards         /></S>} />
                <Route path="portal/transactions"    element={<S><MyTransactions  /></S>} />
                <Route path="portal/alerts"          element={<S><MyAlerts        /></S>} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
