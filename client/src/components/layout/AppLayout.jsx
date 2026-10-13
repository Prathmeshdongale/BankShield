/**
 * AppLayout.jsx — Shell wrapping all authenticated pages.
 * Renders Topbar + role-based Sidebar + main content area.
 */

import React, { useState, useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Topbar } from './Topbar';
import Sidebar from './Sidebar';
import SuperAdminSidebar from './SuperAdminSidebar';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/utils/cn';
import { InlineLoader } from '@/components/ui/LoadingOverlay';

export const AppLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { user, isAuthenticated, isLoading } = useAuth();

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <InlineLoader label="Loading..." />
      </div>
    );
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Determine sidebar type based on role
  const isSuperAdmin = user.role === 'super_admin';

  // Close sidebar on mobile when navigating
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    
    // Initial check
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <Topbar
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        sidebarOpen={sidebarOpen}
      />

      <div className="flex flex-1 overflow-hidden">
        {isSuperAdmin ? (
          <SuperAdminSidebar className={cn(sidebarOpen ? 'translate-x-0' : '-translate-x-64')} />
        ) : (
          <Sidebar className={cn(sidebarOpen ? 'translate-x-0' : '-translate-x-64', 'transition-transform duration-300')} />
        )}

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
