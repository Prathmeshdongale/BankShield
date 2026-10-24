/**
 * Topbar.jsx — Sticky top navigation bar.
 *
 * Improvements over previous version:
 *   • Real user avatar — shows avatarUrl image OR initials fallback
 *   • Live unread notification badge — fetches /api/notifications/unread-count
 *     on mount and re-fetches whenever the route changes (focus event)
 *   • Notification count shown on bell icon; clears when /notifications visited
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  ShieldAlert, Bell, Sun, Moon,
  Menu, X, LogOut, Settings, ChevronDown,
} from 'lucide-react';
import { Badge }    from '@/components/ui/badge';
import { useAuth }  from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { cn }       from '@/utils/cn';
import { notificationService } from '@/services/notificationService';

const ROLE_LABELS = {
  super_admin        : 'Super Admin',
  admin              : 'Administrator',
  compliance_officer : 'Compliance',
  fraud_analyst      : 'Fraud Analyst',
  branch_manager     : 'Branch Manager',
  teller             : 'Teller',
  customer           : 'Customer',
};

// ── Avatar — image if available, initials fallback ────────────────────────────
const UserAvatar = ({ user, size = 'sm' }) => {
  const dim = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm';
  const initials = [user?.firstName?.[0], user?.lastName?.[0]]
    .filter(Boolean).join('').toUpperCase() || '?';

  if (user?.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={`${user.firstName} avatar`}
        className={cn(dim, 'rounded-full object-cover ring-1 ring-white dark:ring-gray-800')}
        onError={e => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }

  return (
    <div className={cn(
      dim,
      'flex items-center justify-center rounded-full font-bold text-white',
      'bg-gradient-to-br from-blue-500 to-indigo-600 ring-1 ring-white dark:ring-gray-800'
    )}>
      {initials}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
export const Topbar = ({ onToggleSidebar, sidebarOpen }) => {
  const { user, logout }        = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate                = useNavigate();
  const location                = useLocation();

  const [menuOpen,  setMenuOpen]  = useState(false);
  const [unread,    setUnread]    = useState(0);
  const menuRef = useRef(null);

  // ── Fetch unread count ────────────────────────────────────────────────────
  const fetchUnread = useCallback(async () => {
    try {
      const r = await notificationService.unreadCount();
      setUnread(r.data?.count ?? 0);
    } catch {}
  }, []);

  // On mount + whenever route changes
  useEffect(() => {
    fetchUnread();
  }, [location.pathname, fetchUnread]);

  // Also re-fetch on window focus (user returns from another tab)
  useEffect(() => {
    window.addEventListener('focus', fetchUnread);
    return () => window.removeEventListener('focus', fetchUnread);
  }, [fetchUnread]);

  // Clear badge optimistically when visiting notifications
  useEffect(() => {
    if (location.pathname === '/notifications') setUnread(0);
  }, [location.pathname]);

  // ── Close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    const handler = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login');
  };

  return (
    <header className={cn(
      'sticky top-0 z-50 flex h-16 w-full items-center justify-between',
      'border-b px-4 backdrop-blur-sm',
      'border-slate-200 bg-white/95',
      'dark:border-slate-700/40 dark:bg-gray-900/95'
    )}>

      {/* ── Left: hamburger + logo ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
            Bank<span className="text-blue-600">Shield</span>
          </span>
        </Link>

        <Badge variant="outline" className="hidden font-mono text-[10px] sm:flex dark:border-gray-700 dark:text-gray-400">
          v2.0 ML
        </Badge>
      </div>

      {/* ── Right: theme · notifications · user menu ──────────────────────── */}
      <div className="flex items-center gap-1">

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className={cn(
            'rounded-lg p-2 transition-colors',
            'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
            'dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-amber-400'
          )}
        >
          {isDark
            ? <Sun  className="h-5 w-5 text-amber-400" />
            : <Moon className="h-5 w-5" />}
        </button>

        {/* Notifications bell with live badge */}
        <Link
          to="/notifications"
          aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
          className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className={cn(
              'absolute right-1 top-1 flex items-center justify-center rounded-full bg-red-500 font-bold text-white',
              unread > 9 ? 'h-4 min-w-[1rem] px-0.5 text-[9px]' : 'h-4 w-4 text-[10px]'
            )}>
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Link>

        {/* User menu */}
        <div ref={menuRef} className="relative ml-1">
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="true"
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <UserAvatar user={user} />
            <div className="hidden flex-col items-start sm:flex">
              <span className="leading-tight text-sm">
                {user?.firstName ?? 'User'}
              </span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">
                {ROLE_LABELS[user?.role] ?? user?.role}
              </span>
            </div>
            <ChevronDown className={cn(
              'h-4 w-4 text-gray-400 transition-transform duration-150',
              menuOpen && 'rotate-180'
            )} />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div className={cn(
              'absolute right-0 top-full mt-1 w-56 origin-top-right rounded-xl border shadow-lg',
              'border-gray-200 bg-white py-1 dark:border-gray-700 dark:bg-gray-900'
            )}>
              {/* Identity row */}
              <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <UserAvatar user={user} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {user?.email}
                  </p>
                </div>
              </div>

              <Link
                to="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Settings className="h-4 w-4" />
                Profile &amp; Settings
              </Link>

              <Link
                to="/notifications"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Bell className="h-4 w-4" />
                Notifications
                {unread > 0 && (
                  <span className="ml-auto flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>

              <div className="my-1 border-t border-gray-100 dark:border-gray-800" />

              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Topbar;
