/**
 * Sidebar.jsx — Role-based navigation sidebar with Gemini/ChatGPT-style collapsible rail.
 */
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard, Users, ShieldCheck, Activity,
  CreditCard, TrendingUp, AlertTriangle, FileText,
  Settings, Cpu, Lock, LogOut, UserCheck,
  Search, Bell, Home, Landmark, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { cn } from '@/utils/cn';

const NAVIGATION = {
  customer: [
    { id: 'dashboard',          label: 'Fraud Overview',        icon: Home,           path: '/'                            },
    { id: 'accounts',           label: 'My Accounts',            icon: CreditCard,     path: '/portal/accounts'             },
    { id: 'cards',              label: 'My Cards',               icon: CreditCard,     path: '/portal/cards'                },
    { id: 'transactions',       label: 'Monitored Activity',     icon: TrendingUp,     path: '/portal/transactions'         },
    { id: 'alerts',             label: 'Security Alerts',        icon: AlertTriangle,  path: '/portal/alerts'               },
    { id: 'notifications',      label: 'Notifications',          icon: Bell,           path: '/notifications'               },
    { id: 'profile',            label: 'Security Profile',       icon: UserCheck,      path: '/profile'                     },
    { id: 'logout',             label: 'Logout',                 icon: LogOut,         path: '/logout'                      },
  ],
  branch_manager: [
    { id: 'dashboard',          label: 'Branch Overview',        icon: LayoutDashboard,path: '/'                            },
    { id: 'customers',          label: 'Branch Customers',       icon: Users,          path: '/branch/customers'            },
    { id: 'accounts',           label: 'Accounts',               icon: CreditCard,     path: '/branch/accounts'             },
    { id: 'transactions',       label: 'Transactions',           icon: TrendingUp,     path: '/branch/transactions'         },
    { id: 'reports',            label: 'Branch Reports',         icon: FileText,       path: '/branch/reports'              },
    { id: 'fraud_alerts',       label: 'Fraud Alerts',           icon: AlertTriangle,  path: '/fraud/alerts'                },
    { id: 'notifications',      label: 'Notifications',          icon: Bell,           path: '/notifications'               },
    { id: 'profile',            label: 'My Profile',             icon: UserCheck,      path: '/profile'                     },
    { id: 'logout',             label: 'Logout',                 icon: LogOut,         path: '/logout'                      },
  ],
  fraud_analyst: [
    { id: 'dashboard',          label: 'Fraud Dashboard',        icon: LayoutDashboard,path: '/'                            },
    { id: 'fraud_alerts',       label: 'Fraud Alerts',           icon: AlertTriangle,  path: '/fraud/alerts'                },
    { id: 'investigations',     label: 'Investigations',         icon: Search,         path: '/fraud/investigations'        },
    { id: 'ml_predictions',     label: 'Risk Analysis',          icon: Cpu,            path: '/fraud/ml-predictions'        },
    { id: 'reports',            label: 'Fraud Reports',          icon: FileText,       path: '/reports'                     },
    { id: 'notifications',      label: 'Notifications',          icon: Bell,           path: '/notifications'               },
    { id: 'profile',            label: 'My Profile',             icon: UserCheck,      path: '/profile'                     },
    { id: 'logout',             label: 'Logout',                 icon: LogOut,         path: '/logout'                      },
  ],
  super_admin: [
    { id: 'dashboard',          label: 'System Operations',      icon: LayoutDashboard,path: '/'                            },
    { id: 'users',              label: 'Staff Management',       icon: Users,          path: '/admin/users'                 },
    { id: 'branches',           label: 'Branches',               icon: Landmark,       path: '/admin/branches'              },
    { id: 'settings',           label: 'Module Config',          icon: Settings,       path: '/admin/settings'              },
    { id: 'audit_logs',         label: 'Security & Audit',       icon: Lock,           path: '/admin/audit-logs'            },
    { id: 'ml_status',          label: 'ML Health & Diagnostics',icon: Cpu,            path: '/ml/status'                   },
    { id: 'logout',             label: 'Logout',                 icon: LogOut,         path: '/logout'                      },
  ],
};

export const Sidebar = ({ className, collapsed = false, onToggle }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const navItems = user ? (NAVIGATION[user.role] ?? []) : [];

  const handleLogout = async () => {
    await logout(true);
    navigate('/login');
  };

  return (
    <aside
      className={cn(
        'flex flex-col h-full border-r transition-all duration-300',
        'bg-slate-900 border-slate-800 text-slate-100 select-none',
        collapsed ? 'w-16' : 'w-64',
        className
      )}
    >
      {/* Brand Header */}
      {!collapsed ? (
        <div className="flex h-16 items-center justify-between px-4 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 shadow-md shadow-blue-500/20 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-base tracking-wide text-white flex items-center gap-1">
                Bank<span className="text-blue-400">Shield</span>
              </span>
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-medium">
                Fraud Defense
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
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white transition group shadow-md"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="h-5 w-5 group-hover:scale-110 transition-transform" />
          </button>
        </div>
      )}

      {/* Navigation Links */}
      <div className={cn('flex-1 overflow-y-auto py-4 space-y-1', collapsed ? 'px-2' : 'px-3')}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);

          if (item.id === 'logout') {
            return (
              <button
                key={item.id}
                onClick={handleLogout}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'w-full flex items-center rounded-lg text-sm font-medium transition-all',
                  collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                  'text-slate-400 hover:text-rose-400 hover:bg-slate-800/60'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          }

          return (
            <Link
              key={item.id}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium transition-all group',
                collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                isActive
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              )}
            >
              <Icon className={cn('h-4 w-4 shrink-0 transition-transform group-hover:scale-105', isActive ? 'text-white' : 'text-slate-400')} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </div>

      {/* Active User Footer */}
      {user && (
        <div className="p-3 border-t border-slate-800 bg-slate-900/50">
          <div className={cn(
            'flex items-center rounded-lg',
            collapsed ? 'justify-center py-1' : 'gap-3 px-2 py-1.5'
          )}>
            <div
              title={collapsed ? `${user.firstName} ${user.lastName} (${user.role})` : undefined}
              className="h-8 w-8 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-semibold text-xs shrink-0"
            >
              {user.firstName?.[0] || 'U'}
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-semibold text-slate-200 truncate">
                  {user.firstName} {user.lastName}
                </span>
                <span className="text-[10px] text-slate-400 truncate capitalize">
                  {user.role?.replace(/_/g, ' ')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
