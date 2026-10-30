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
  Search, Bell, Home, Landmark,
} from 'lucide-react';
import { cn } from '@/utils/cn';

const NAVIGATION = {
  customer: [
    { id: 'dashboard',    label: 'Fraud Overview',  icon: Home,           path: '/'                   },
    { id: 'accounts',     label: 'My Accounts',      icon: CreditCard,     path: '/portal/accounts'    },
    { id: 'cards',        label: 'My Cards',         icon: CreditCard,     path: '/portal/cards'       },
    { id: 'transactions', label: 'Monitored Activity', icon: TrendingUp,   path: '/portal/transactions'},
    { id: 'alerts',       label: 'Security Alerts',  icon: AlertTriangle,  path: '/portal/alerts'      },
    { id: 'notifications',label: 'Notifications',    icon: Bell,           path: '/notifications'      },
    { id: 'profile',      label: 'Security Profile', icon: UserCheck,      path: '/profile'            },
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
    { id: 'dashboard',  label: 'System Operations',icon: LayoutDashboard, path: '/'                   },
    { id: 'users',      label: 'Staff Management', icon: Users,           path: '/admin/users'        },
    { id: 'branches',   label: 'Branches',         icon: Landmark,        path: '/admin/branches'     },
    { id: 'settings',   label: 'Module Config',    icon: Settings,        path: '/admin/settings'     },
    { id: 'audit_logs', label: 'Security & Audit', icon: Lock,            path: '/admin/audit-logs'   },
    { id: 'ml_status',  label: 'ML Health & Diagnostics', icon: Cpu,      path: '/ml/status'          },
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

  return (
    <aside
      className={cn(
        'flex flex-col w-64 border-r transition-colors',
        'bg-slate-900 border-slate-800 text-slate-100',
        className
      )}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center gap-3 px-5 border-b border-slate-800">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-md shadow-blue-500/20 text-white">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <span className="text-lg font-bold tracking-tight text-white">
            Bank<span className="text-blue-400">Shield</span>
          </span>
          <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">
            {user?.role ? user.role.replace('_', ' ') : 'Operations'}
          </span>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        {navItems.map((item) => {
          if (item.id === 'logout') {
            return (
              <button
                key={item.id}
                onClick={handleLogout}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left',
                  'text-slate-400 hover:bg-slate-800 hover:text-red-400'
                )}
              >
                <item.icon className="h-5 w-5 shrink-0 text-slate-400" />
                <span>{item.label}</span>
              </button>
            );
          }

          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.id}
              to={item.path}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              )}
            >
              <item.icon
                className={cn(
                  'h-5 w-5 shrink-0',
                  isActive ? 'text-white' : 'text-slate-400'
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Footer */}
      {isAuthenticated && user && (
        <div className="border-t border-slate-800 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-blue-400 border border-slate-700">
              {user.name ? user.name[0].toUpperCase() : 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-semibold text-white">
                {user.name || user.email}
              </p>
              <p className="truncate text-[10px] text-slate-400">
                {user.email}
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
