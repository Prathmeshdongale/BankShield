/**
 * ProtectedRoute.jsx — Wraps routes that require authentication.
 *
 * Props:
 *   roles        string | string[]  — if given, user must hold one of these roles
 *   permissions  string | string[]  — if given, user must hold ALL of these perms
 *   redirectTo   string             — where to send unauthenticated users (default /login)
 *   fallback     ReactNode          — shown while auth is loading
 *
 * Examples:
 *   <ProtectedRoute />                        — any authenticated user
 *   <ProtectedRoute roles="fraud_analyst" />  — fraud analysts only
 *   <ProtectedRoute roles={['super_admin','branch_manager']} />
 *   <ProtectedRoute permissions="fraud:investigate" />
 */

import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui/Spinner';

const ProtectedRoute = ({
  roles       = null,
  permissions = null,
  redirectTo  = '/login',
  fallback    = null,
}) => {
  const { user, isAuthenticated, isLoading, hasRole, hasPermission } = useAuth();
  const location = useLocation();

  // Still restoring session
  if (isLoading) {
    return fallback ?? (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Spinner size="lg" />
      </div>
    );
  }

  // Not logged in
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Role guard - only 4 roles: super_admin, branch_manager, fraud_analyst, customer
  if (roles) {
    const allowed = Array.isArray(roles) ? roles : [roles];
    const validRoles = ['super_admin', 'branch_manager', 'fraud_analyst', 'customer'];
    
    // Validate that requested roles are valid
    const invalidRoles = allowed.filter(r => !validRoles.includes(r));
    if (invalidRoles.length > 0) {
      console.warn(`ProtectedRoute: Invalid roles requested: ${invalidRoles.join(', ')}`);
      return <Navigate to="/unauthorized" replace />;
    }
    
    if (!allowed.includes(user.role)) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  // Permission guard
  if (permissions) {
    if (!hasPermission(permissions)) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return <Outlet />;
};

export default ProtectedRoute;
