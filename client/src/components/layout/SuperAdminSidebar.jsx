/**
 * SuperAdminSidebar.jsx — Platform administration sidebar, dark-mode aware.
 */
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Settings, Lock, Cpu, Activity, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/utils/cn';

const NAV = [
  { id: 'dashboard',  label: 'System Overview',  icon: LayoutDashboard, path: '/'                },
  { id: 'users',      label: 'User Management',  icon: Users,           path: '/admin/users'     },
  { id: 'settings',   label: 'System Settings',  icon: Settings,        path: '/admin/settings'  },
  { id: 'audit_logs', label: 'Security & Audit', icon: Lock,            path: '/admin/audit-logs'},
  { id: 'ml_status',  label: 'ML Model Status',  icon: Cpu,             path: '/ml/status'       },
  { id: 'api_health', label: 'API & Health',     icon: Activity,        path: '/health'          },
];

const SuperAdminSidebar = ({ className }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = async () => { await logout(true); navigate('/login'); };

  return (
    <aside className={cn('flex h-full flex-col overflow-hidden', className)}>
      {/* Logo */}
      <div className={cn(
        'flex items-center gap-2.5 px-5 py-4 border-b',
        'border-slate-200 dark:border-slate-700/40'
      )}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <span className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
          Bank<span className="text-violet-600 dark:text-violet-400">Shield</span>
        </span>
      </div>

      {/* Admin label */}
      <div className="px-5 pt-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-violet-500 dark:text-violet-400">
          Platform Admin
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {NAV.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.id}
              to={item.path}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-violet-600 text-white shadow-sm dark:bg-violet-700'
                  : [
                      'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                      'dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100',
                    ]
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className={cn('px-2 py-3 border-t', 'border-slate-200 dark:border-slate-700/40')}>
        <button
          onClick={handleLogout}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            'text-slate-500 hover:bg-red-50 hover:text-red-600',
            'dark:text-slate-500 dark:hover:bg-red-950/30 dark:hover:text-red-400'
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default SuperAdminSidebar;
