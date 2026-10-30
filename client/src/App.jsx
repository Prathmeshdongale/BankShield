import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import { ThemeProvider }  from '@/context/ThemeContext';
import { AuthProvider }   from '@/context/AuthContext';
import ProtectedRoute     from '@/components/auth/ProtectedRoute';
import AppLayout          from '@/components/layout/AppLayout';
import { InlineLoader }   from '@/components/ui/LoadingOverlay';
import { useAuth }        from '@/context/AuthContext';

import Login          from '@/pages/Login';
import Register       from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword  from '@/pages/ResetPassword';
import Unauthorized   from '@/pages/Unauthorized';

// ── Implemented pages ─────────────────────────────────────────────────────────
const CustomerDashboard      = lazy(() => import('@/pages/dashboard/CustomerDashboard'));
const BranchManagerDashboard = lazy(() => import('@/pages/dashboard/BranchManagerDashboard'));
const FraudAnalystDashboard  = lazy(() => import('@/pages/dashboard/FraudAnalystDashboard'));
const SuperAdminDashboard    = lazy(() => import('@/pages/dashboard/SuperAdminDashboard'));
const Transactions   = lazy(() => import('@/pages/Transactions'));
const FraudAlerts    = lazy(() => import('@/pages/FraudAlerts'));
const Transfer       = lazy(() => import('@/pages/Transfer'));
const CustomerList   = lazy(() => import('@/pages/customers/CustomerList'));
const CustomerDetail = lazy(() => import('@/pages/customers/CustomerDetail'));
const AccountList    = lazy(() => import('@/pages/accounts/AccountList'));
const AccountDetail  = lazy(() => import('@/pages/accounts/AccountDetail'));
const CardsList      = lazy(() => import('@/pages/cards/CardsList'));
const CardDetail     = lazy(() => import('@/pages/cards/CardDetail'));

// ── Fraud ─────────────────────────────────────────────────────────────────────
const Investigations = lazy(() => import('@/pages/fraud/InvestigationList'));
const AlertDetail    = lazy(() => import('@/pages/fraud/AlertDetail'));

// ── Reports & Audit ───────────────────────────────────────────────────────────
const Reports        = lazy(() => import('@/pages/reports/Reports'));
const AuditLogs      = lazy(() => import('@/pages/reports/AuditLogs'));

// ── Profile ───────────────────────────────────────────────────────────────────
const Profile        = lazy(() => import('@/pages/profile/Profile'));

// ── Admin ─────────────────────────────────────────────────────────────────────
const UserManagement  = lazy(() => import('@/pages/admin/UserManagement'));
const SystemSettings  = lazy(() => import('@/pages/admin/SystemSettings'));

// ── Customer portal ───────────────────────────────────────────────────────────
const CustomerHome      = lazy(() => import('@/pages/portal/CustomerHome'));
const MyAccounts        = lazy(() => import('@/pages/portal/MyAccounts'));
const MyAccountDetail   = lazy(() => import('@/pages/portal/MyAccountDetail'));
const MyTransactions    = lazy(() => import('@/pages/portal/MyTransactions'));
const MyCards           = lazy(() => import('@/pages/portal/MyCards'));
const MyAlerts          = lazy(() => import('@/pages/portal/MyAlerts'));

// ── Branches & Notifications ──────────────────────────────────────────────────
const Branches       = lazy(() => import('@/pages/branches/Branches'));
const Notifications  = lazy(() => import('@/pages/Notifications'));

const PageLoader = () => (
  <div className="flex h-64 items-center justify-center">
    <InlineLoader label="Loading…" />
  </div>
);

// ── Dashboard router based on user role ───────────────────────────────────────
const DashboardRouter = () => {
  const { user, hasRole } = useAuth();
  
  if (hasRole('super_admin')) {
    return <SuperAdminDashboard />;
  }
  
  if (hasRole('branch_manager')) {
    return <BranchManagerDashboard />;
  }
  
  if (hasRole('fraud_analyst')) {
    return <FraudAnalystDashboard />;
  }
  
  if (hasRole('customer')) {
    return <CustomerDashboard />;
  }
  
  console.warn(`Unknown role: ${user?.role}. Falling back to customer dashboard.`);
  return <CustomerDashboard />;
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
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
              <Route path="/register"        element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password"  element={<ResetPassword />} />
              <Route path="/unauthorized"    element={<Unauthorized />} />

              {/* Protected — all authenticated users */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  {/* Role-specific dashboards (rendered inside AppLayout's Outlet) */}
                  <Route index element={<DashboardRouter />} />
                  
                  {/* Banking Operations - restricted to branch managers and fraud analysts (Super Admin restricted, Customer uses /portal) */}
                  <Route element={<ProtectedRoute roles={['branch_manager', 'fraud_analyst']} />}>
                    <Route path="transactions"      element={<Transactions />} />
                    <Route path="accounts"          element={<AccountList />} />
                    <Route path="accounts/:id"      element={<AccountDetail />} />
                    <Route path="cards"             element={<CardsList />} />
                    <Route path="cards/:id"         element={<CardDetail />} />
                    <Route path="customers"         element={<CustomerList />} />
                    <Route path="customers/:id"     element={<CustomerDetail />} />
                  </Route>

                  {/* Branch Manager Transfers */}
                  <Route element={<ProtectedRoute roles={['branch_manager']} />}>
                    <Route path="transfer"          element={<Transfer />} />
                  </Route>

                  <Route path="branches"          element={<Branches />} />
                  <Route path="notifications"     element={<Notifications />} />
                  <Route path="reports"           element={<Reports />} />
                  <Route path="profile"           element={<Profile />} />

                  {/* Super Admin - Platform configuration and staff management ONLY (Privacy boundary strictly enforced) */}
                  <Route element={<ProtectedRoute roles={['super_admin']} />}>
                    <Route path="admin/users"         element={<UserManagement />} />
                    <Route path="admin/settings"      element={<SystemSettings />} />
                    <Route path="admin/audit-logs"    element={<AuditLogs />} />
                    <Route path="admin/branches"      element={<Branches />} />
                    <Route path="ml/status"           element={<SystemSettings />} />
                  </Route>

                  {/* Branch Manager - Branch operations */}
                  <Route element={<ProtectedRoute roles={['branch_manager']} />}>
                    <Route path="branch/customers"    element={<CustomerList />} />
                    <Route path="branch/customers/:id" element={<CustomerDetail />} />
                    <Route path="branch/accounts"     element={<AccountList />} />
                    <Route path="branch/transactions" element={<Transactions />} />
                    <Route path="branch/reports"      element={<Reports />} />
                  </Route>

                  {/* Fraud Analyst - Investigation tools */}
                  <Route element={<ProtectedRoute roles={['fraud_analyst']} />}>
                    <Route path="fraud/alerts"        element={<FraudAlerts />} />
                    <Route path="fraud/alerts/:id"    element={<AlertDetail />} />
                    <Route path="fraud/investigations" element={<Investigations />} />
                    <Route path="fraud/ml-predictions" element={<FraudAlerts />} />
                  </Route>

                  {/* Customer portal - own accounts & transactions only */}
                  <Route path="portal"                element={<CustomerHome />} />
                  <Route path="portal/accounts"       element={<MyAccounts />} />
                  <Route path="portal/accounts/:id"   element={<MyAccountDetail />} />
                  <Route path="portal/cards"          element={<MyCards />} />
                  <Route path="portal/cards/:id"      element={<CardDetail />} />
                  <Route path="portal/transactions"   element={<MyTransactions />} />
                  <Route path="portal/alerts"         element={<MyAlerts />} />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </Suspense>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
