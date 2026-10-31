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

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#0a0f1a]">
        <InlineLoader label="Loading..." />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const isSuperAdmin = user.role === 'super_admin';

  // Collapse sidebar on narrow screens
  useEffect(() => {
    const handleResize = () => {
      setSidebarOpen(window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-text)]">
      <Topbar
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        sidebarOpen={sidebarOpen}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={cn(
          'fixed left-0 top-0 z-30 h-full transition-all duration-300 ease-in-out',
          'border-r border-slate-800 bg-slate-900',
          sidebarOpen ? 'w-64' : 'w-16'
        )}>
          {isSuperAdmin
            ? <SuperAdminSidebar className="h-full" collapsed={!sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />
            : <Sidebar className="h-full" collapsed={!sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />
          }
        </div>

        {/* Main content */}
        <main className={cn(
          'flex-1 overflow-y-auto p-6 lg:p-8 transition-all duration-300 ease-in-out',
          sidebarOpen ? 'ml-64' : 'ml-16'
        )}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
