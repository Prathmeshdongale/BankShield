/**
 * SuperAdminSidebar.jsx — Platform administration sidebar with collapsible rail.
 */
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Settings, Lock, Cpu,
  Activity, LogOut, ShieldCheck, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
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

export const SuperAdminSidebar = ({ className, collapsed = false, onToggle }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = async () => { await logout(true); navigate('/login'); };

  return (
    <aside className={cn(
      'flex h-full flex-col overflow-hidden transition-all duration-300 select-none bg-slate-900 border-r border-slate-800 text-slate-100',
      collapsed ? 'w-16' : 'w-64',
      className
    )}>
      {/* Header */}
      {!collapsed ? (
        <div className="flex h-16 items-center justify-between px-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-500/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-base font-bold tracking-tight text-white truncate">
                Bank<span className="text-violet-400">Shield</span>
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-violet-400">
                Platform Admin
              </span>
            </div>
          </div>
          {onToggle && (
            <button
              onClick={onToggle}
              title="Collapse sidebar"
              className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex h-16 items-center justify-center border-b border-slate-800">
          <button
            onClick={onToggle}
            title="Expand sidebar"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600/20 hover:bg-violet-600 text-violet-400 hover:text-white transition group shadow-md"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="h-5 w-5 group-hover:scale-110 transition-transform" />
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className={cn('flex-1 overflow-y-auto py-3 space-y-1', collapsed ? 'px-2' : 'px-3')}>
        {NAV.map(item => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.id}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium transition-all group',
                collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                isActive
                  ? 'bg-violet-600 text-white shadow-sm shadow-violet-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              )}
            >
              <Icon className={cn('h-4 w-4 shrink-0 transition-transform group-hover:scale-105', isActive ? 'text-white' : 'text-slate-400')} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Logout button at bottom */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/50">
        <button
          onClick={handleLogout}
          title={collapsed ? 'Sign Out' : undefined}
          className={cn(
            'w-full flex items-center rounded-lg text-sm font-medium transition-colors text-slate-400 hover:text-rose-400 hover:bg-slate-800/60',
            collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2'
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
};

export default SuperAdminSidebar;
