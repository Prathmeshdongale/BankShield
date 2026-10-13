/**
 * SuperAdminSidebar.jsx — Platform administration sidebar.
 *
 * Shows ONLY platform management navigation:
 * - User management
 * - System settings
 * - ML model management
 * - API health monitoring
 * - Security & audit logs
 *
 * NEVER shows banking operations (accounts, transactions, cards, transfers, customers).
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Settings, Lock, Cpu, Activity, LogOut } from 'lucide-react';

const SuperAdminSidebar = ({ className }) => {
  const location = useLocation();

  const navItems = [
    { id: 'dashboard', label: 'System Overview', icon: LayoutDashboard, path: '/' },
    { id: 'users', label: 'User Management', icon: Users, path: '/admin/users' },
    { id: 'settings', label: 'System Settings', icon: Settings, path: '/admin/settings' },
    { id: 'audit_logs', label: 'Security & Audit', icon: Lock, path: '/admin/audit-logs' },
    { id: 'ml_status', label: 'ML Model Status', icon: Cpu, path: '/ml/status' },
    { id: 'api_health', label: 'API & Health', icon: Activity, path: '/health' },
  ];

  return (
    <aside className={`fixed left-0 top-0 z-30 flex h-full w-64 flex-col border-r bg-white dark:border-gray-800 dark:bg-gray-900 ${className}`}>
      {/* Logo */}
      <div className="flex items-center justify-center border-b border-gray-100 p-4 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 text-white">
            <Lock className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold text-gray-900 dark:text-white">
            Bank<span className="text-purple-600">Shield</span>
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <li key={item.id}>
                <Link
                  to={item.path}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400'
                      : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Logout */}
      <div className="border-t border-gray-100 p-4 dark:border-gray-800">
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20">
          <LogOut className="h-5 w-5" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default SuperAdminSidebar;
