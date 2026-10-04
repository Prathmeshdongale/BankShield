/**
 * Sidebar.jsx — Role-driven navigation sidebar.
 *
 * Nav items are filtered by the current user's role.
 * Collapses to icon-only on mobile (toggled by parent layout).
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ArrowLeftRight, ShieldAlert, Send,
  Users, Building2, CreditCard, FileText, Bell,
  AlertOctagon, ChevronRight, Zap, ClipboardList, UserCircle,
  Home, ShieldCheck,
} from 'lucide-react';
import { cn }      from '@/utils/cn';
import { useAuth } from '@/context/AuthContext';
import { Badge }   from '@/components/ui/badge';

// ── Role groups ───────────────────────────────────────────────────────────────
const STAFF  = ['super_admin','admin','compliance_officer','fraud_analyst','branch_manager','teller'];
const ANALYST= ['super_admin','admin','compliance_officer','fraud_analyst'];
const MGMT   = ['super_admin','admin','branch_manager'];
const FRONT  = ['super_admin','admin','compliance_officer','fraud_analyst','branch_manager','teller'];

// ── Nav definitions ──────────────────────────────────────────────────────────
// roles     : who can see this item (empty = every authenticated user)
// hideFor   : hide this entire section when the user's role is in this list
const NAV_ITEMS = [
  {
    section : 'Overview',
    items   : [
      { name: 'Dashboard',     path: '/',              icon: LayoutDashboard, roles: [] },
    ],
  },
  // ── Staff / admin sections — hidden from pure customer accounts ────────────
  {
    section : 'Banking',
    hideFor : ['customer'],
    items   : [
      { name: 'Accounts',      path: '/accounts',      icon: Building2,      roles: STAFF },
      { name: 'Transactions',  path: '/transactions',  icon: ArrowLeftRight, roles: STAFF },
      { name: 'Cards',         path: '/cards',         icon: CreditCard,     roles: STAFF },
      { name: 'Transfer',      path: '/transfer',      icon: Send,           roles: STAFF },
    ],
  },
  {
    section : 'Fraud & Risk',
    hideFor : ['customer'],
    items   : [
      { name: 'Fraud Alerts',   path: '/fraud/alerts',         icon: ShieldAlert,  roles: FRONT  },
      { name: 'Investigations', path: '/fraud/investigations', icon: AlertOctagon, roles: ANALYST },
    ],
  },
  {
    section : 'People',
    hideFor : ['customer'],
    items   : [
      { name: 'Customers', path: '/customers', icon: Users,    roles: FRONT },
      { name: 'Branches',  path: '/branches',  icon: Building2,roles: MGMT  },
    ],
  },
  {
    section : 'Reporting',
    hideFor : ['customer'],
    items   : [
      { name: 'Reports',   path: '/reports',    icon: FileText,    roles: STAFF  },
      { name: 'Audit Logs',path: '/audit-logs', icon: ClipboardList,roles: ANALYST },
    ],
  },
  // ── Customer portal — hidden from staff (they have the full admin views) ───
  {
    section : 'My Portal',
    hideFor : STAFF,
    items   : [
      { name: 'Overview',        path: '/portal',              icon: Home,          roles: [] },
      { name: 'My Accounts',     path: '/portal/accounts',     icon: Building2,     roles: [] },
      { name: 'My Cards',        path: '/portal/cards',        icon: CreditCard,    roles: [] },
      { name: 'My Transactions', path: '/portal/transactions', icon: ArrowLeftRight,roles: [] },
      { name: 'Security Alerts', path: '/portal/alerts',       icon: ShieldCheck,   roles: [] },
    ],
  },
  // ── Always visible ─────────────────────────────────────────────────────────
  {
    section : 'Account',
    items   : [
      { name: 'Notifications', path: '/notifications', icon: Bell,       roles: [] },
      { name: 'Profile',       path: '/profile',       icon: UserCircle, roles: [] },
    ],
  },
];

export const Sidebar = ({ collapsed = false }) => {
  const { user } = useAuth();
  const role     = user?.role ?? '';

  const isVisible = (item) =>
    item.roles.length === 0 || item.roles.includes(role);

  return (
    <aside
      className={cn(
        'flex h-[calc(100vh-4rem)] flex-col border-r border-gray-200 bg-white',
        'dark:border-gray-800 dark:bg-gray-900',
        'transition-all duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-5">
        {NAV_ITEMS.map(section => {
          // Hide entire section if user role is in hideFor
          if (section.hideFor && section.hideFor.includes(role)) return null;

          const visible = section.items.filter(isVisible);
          if (!visible.length) return null;
          return (
            <div key={section.section}>
              {!collapsed && (
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                  {section.section}
                </p>
              )}
              <div className="space-y-0.5">
                {visible.map(item => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/'}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
                          collapsed && 'justify-center'
                        )
                      }
                      title={collapsed ? item.name : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.name}</span>}
                      {!collapsed && item.badge && (
                        <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0">
                          {item.badge}
                        </Badge>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* ML status footer */}
      {!collapsed && (
        <div className="m-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/40">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-900 dark:text-blue-300">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <Zap className="h-3 w-3" />
            XGBoost Engine Active
          </div>
          <p className="mt-1 text-[11px] text-blue-700 dark:text-blue-400">
            Real-time risk scoring enabled.
          </p>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
