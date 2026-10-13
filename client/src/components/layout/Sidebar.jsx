/**
 * Sidebar.jsx — Role-based navigation sidebar.
 *
 * Dynamically renders navigation items based on user role.
 * Enforces platform vs. banking access separation.
 */

import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard, Users, ShieldCheck, Activity,
  CreditCard, TrendingUp, AlertTriangle, FileText,
  Settings, Cpu, Lock, LogOut, UserCheck,
  BarChart2, Clock, Search, Bell
} from 'lucide-react';
import { cn } from '@/utils/cn';

const NAVIGATION = {
  customer: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { id: 'accounts', label: 'My Accounts', icon: CreditCard, path: '/portal/accounts' },
    { id: 'transactions', label: 'My Transactions', icon: TrendingUp, path: '/portal/transactions' },
    { id: 'cards', label: 'My Cards', icon: Activity, path: '/portal/cards' },
    { id: 'transfer', label: 'Transfers', icon: TrendingUp, path: '/transfer' },
    { id: 'alerts', label: 'Fraud Alerts', icon: AlertTriangle, path: '/portal/alerts' },
    { id: 'notifications', label: 'Notifications', icon: Bell, path: '/notifications' },
    { id: 'profile', label: 'My Profile', icon: UserCheck, path: '/profile' },
    { id: 'logout', label: 'Logout', icon: LogOut, path: '/logout' },
  ],
  branch_manager: [
    { id: 'dashboard', label: 'Branch Overview', icon: LayoutDashboard, path: '/' },
    { id: 'customers', label: 'Branch Customers', icon: Users, path: '/branch/customers' },
    { id: 'accounts', label: 'Accounts', icon: CreditCard, path: '/branch/accounts' },
    { id: 'transactions', label: 'Transactions', icon: TrendingUp, path: '/branch/transactions' },
    { id: 'reports', label: 'Branch Reports', icon: FileText, path: '/branch/reports' },
    { id: 'fraud_alerts', label: 'Fraud Alerts', icon: AlertTriangle, path: '/fraud/alerts' },
    { id: 'notifications', label: 'Notifications', icon: Bell, path: '/notifications' },
    { id: 'profile', label: 'My Profile', icon: UserCheck, path: '/profile' },
    { id: 'logout', label: 'Logout', icon: LogOut, path: '/logout' },
  ],
  fraud_analyst: [
    { id: 'dashboard', label: 'Fraud Dashboard', icon: LayoutDashboard, path: '/' },
    { id: 'fraud_alerts', label: 'Fraud Alerts', icon: AlertTriangle, path: '/fraud/alerts' },
    { id: 'investigations', label: 'Investigations', icon: Search, path: '/fraud/investigations' },
    { id: 'ml_predictions', label: 'Risk Analysis', icon: Cpu, path: '/fraud/ml-predictions' },
    { id: 'reports', label: 'Fraud Reports', icon: FileText, path: '/reports' },
    { id: 'notifications', label: 'Notifications', icon: Bell, path: '/notifications' },
    { id: 'profile', label: 'My Profile', icon: UserCheck, path: '/profile' },
    { id: 'logout', label: 'Logout', icon: LogOut, path: '/logout' },
  ],
  super_admin: [
    { id: 'dashboard', label: 'System Overview', icon: LayoutDashboard, path: '/' },
    { id: 'users', label: 'User Management', icon: Users, path: '/admin/users' },
    { id: 'settings', label: 'System Settings', icon: Settings, path: '/admin/settings' },
    { id: 'audit_logs', label: 'Security & Audit', icon: Lock, path: '/admin/audit-logs' },
    { id: 'ml_status', label: 'ML Model Status', icon: Cpu, path: '/ml/status' },
    { id: 'api_health', label: 'API & Health', icon: Activity, path: '/health' },
    { id: 'logout', label: 'Logout', icon: LogOut, path: '/logout' },
  ],
};

const Sidebar = ({ className }) => {
  const { user, logout, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);
  
  // Determine navigation based on role
  const navItems = user ? NAVIGATION[user.role] || [] : [];
  
  const handleLogout = async () => {
    await logout(true);
    navigate('/login');
  };

  if (!isAuthenticated) return null;

  return (
    <aside className={cn(
      'fixed left-0 top-0 z-30 flex h-full flex-col border-r bg-white transition-transform duration-300 dark:border-gray-800 dark:bg-gray-900',
      isOpen ? 'w-64' : 'w-20',
      className
    )}>
      {/* Logo */}
      <div className="flex items-center justify-center border-b border-gray-100 p-4 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          {isOpen && (
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              Bank<span className="text-blue-600">Shield</span>
            </span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            
            if (item.id === 'logout') {
              return (
                <li key={item.id}>
                  <button
                    onClick={handleLogout}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive 
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                        : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                    )}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    {isOpen && <span>{item.label}</span>}
                  </button>
                </li>
              );
            }

            return (
              <li key={item.id}>
                <Link
                  to={item.path}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive 
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                      : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {isOpen && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;
