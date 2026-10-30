/**
 * Sidebar.jsx — Role-based navigation sidebar, fully dark-mode aware.
 */
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard, Users, ShieldCheck, Activity,
  CreditCard, TrendingUp, AlertTriangle, FileText,
  Settings, Cpu, Lock, LogOut, UserCheck,
  Search, Bell, Home, ArrowLeftRight, Landmark,
} from 'lucide-react';
import { cn } from '@/utils/cn';

const NAVIGATION = {
  customer: [
    { id: 'dashboard',    label: 'Dashboard',       icon: Home,           path: '/'                   },
    { id: 'accounts',     label: 'My Accounts',      icon: CreditCard,     path: '/portal/accounts'    },
    { id: 'cards',        label: 'My Cards',         icon: CreditCard,     path: '/portal/cards'       },
    { id: 'transactions', label: 'My Transactions',  icon: TrendingUp,     path: '/portal/transactions'},
    { id: 'transfer',     label: 'Transfers',         icon: ArrowLeftRight, path: '/transfer'           },
    { id: 'alerts',       label: 'Security Alerts',  icon: AlertTriangle,  path: '/portal/alerts'      },
    { id: 'notifications',label: 'Notifications',    icon: Bell,           path: '/notifications'      },
    { id: 'profile',      label: 'My Profile',       icon: UserCheck,      path: '/profile'            },
    { id: 'logout',       label: 'Logout',            icon: LogOut,         path: '/logout'             },
  ],
  branch_manager: [
    { id: 'dashboard',    label: 'Branch Overview',  icon: LayoutDashboard,path: '/'                   },
    { id: 'customers',    label: 'Branch Customers', icon: Users,          path: '/branch/customers'   },
    { id: 'accounts',     label: 'Accounts',          icon: CreditCard,     path: '/branch/accounts'    },
    { id: 'transactions', label: 'Transactions',      icon: TrendingUp,     path: '/branch/transactions'},
    { id: 'reports',      label: 'Branch Reports',   icon: FileText,       path: '/branch/reports'     },
    { id: 'fraud_alerts', label: 'Fraud Alerts',     icon: AlertTriangle,  path: '/fraud/alerts'       },
    { id: 'notifications',label: 'Notifications',    icon: Bell,           path: '/notifications'      },
    { id: 'profile',      label: 'My Profile',       icon: UserCheck,      path: '/profile'            },
    { id: 'logout',       label: 'Logout',            icon: LogOut,         path: '/logout'             },
  ],
  fraud_analyst: [
    { id: 'dashboard',       label: 'Fraud Dashboard', icon: LayoutDashboard, path: '/'                        },
    { id: 'fraud_alerts',    label: 'Fraud Alerts',    icon: AlertTriangle,   path: '/fraud/alerts'            },
    { id: 'investigations',  label: 'Investigations',  icon: Search,          path: '/fraud/investigations'    },
    { id: 'ml_predictions',  label: 'Risk Analysis',   icon: Cpu,             path: '/fraud/ml-predictions'   },
    { id: 'reports',         label: 'Fraud Reports',   icon: FileText,        path: '/reports'                 },
    { id: 'notifications',   label: 'Notifications',   icon: Bell,            path: '/notifications'           },
    { id: 'profile',         label: 'My Profile',      icon: UserCheck,       path: '/profile'                 },
    { id: 'logout',          label: 'Logout',           icon: LogOut,          path: '/logout'                  },
  ],
  super_admin: [
    { id: 'dashboard',  label: 'System Overview',  icon: LayoutDashboard, path: '/'                   },
    { id: 'users',      label: 'User Management',  icon: Users,           path: '/admin/users'        },
    { id: 'branches',   label: 'Branches',         icon: Landmark,        path: '/admin/branches'     },
    { id: 'settings',   label: 'System Settings',  icon: Settings,        path: '/admin/settings'     },
    { id: 'audit_logs', label: 'Security & Audit', icon: Lock,            path: '/admin/audit-logs'   },
    { id: 'ml_status',  label: 'ML Model Status',  icon: Cpu,             path: '/ml/status'          },
    { id: 'api_health', label: 'API & Health',     icon: Activity,        path: '/admin/settings'     },
    { id: 'logout',     label: 'Logout',            icon: LogOut,          path: '/logout'             },
  ],
};

const Sidebar = ({ className }) => {
  const { user, logout, isAuthenticated } = useAuth();
  const location  = useLocation();
  const navigate  = useNavigate();
  const navItems  = user ? (NAVIGATION[user.role] ?? []) : [];

  const handleLogout = async () => {
    await logout(true);
    navigate('/login');
  };

  if (!isAuthenticated) return null;

  return (
    <aside className={cn(
      'flex h-full flex-col overflow-hidden',
      className
    )}>
      {/* Logo strip */}
      <div className={cn(
        'flex items-center gap-2.5 px-5 py-4 border-b',
        'border-slate-200 dark:border-slate-700/40'
      )}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <span className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
          Bank<span className="text-blue-600 dark:text-blue-400">Shield</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map(item => {
          const isActive = location.pathname === item.path;

          if (item.id === 'logout') {
            return (
              <button
                key={item.id}
                onClick={handleLogout}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                  'transition-colors',
                  'text-slate-500 hover:bg-red-50 hover:text-red-600',
                  'dark:text-slate-500 dark:hover:bg-red-950/30 dark:hover:text-red-400'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          }

          return (
            <Link
              key={item.id}
              to={item.path}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                'transition-colors',
                isActive
                  ? [
                      'bg-blue-600 text-white shadow-sm',
                      'dark:bg-blue-600 dark:text-white',
                    ]
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

      {/* Role badge footer */}
      <div className={cn(
        'px-4 py-3 border-t text-[11px]',
        'border-slate-200 bg-slate-50 text-slate-400',
        'dark:border-slate-700/40 dark:bg-slate-900/60 dark:text-slate-600'
      )}>
        <span className="uppercase tracking-widest font-semibold">
          {user?.role?.replace(/_/g, ' ')}
        </span>
      </div>
    </aside>
  );
};

export default Sidebar;
