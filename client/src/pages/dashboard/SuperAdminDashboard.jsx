/**
 * SuperAdminDashboard.jsx — Platform administration dashboard.
 *
 * Features:
 *   • User management (create, edit, disable users)
 *   • System health monitoring
 *   • Audit log review
 *   • ML model deployment configuration
 *   • Security settings management
 *   • API integration status
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  Users, Settings, Activity, ShieldCheck, Cpu, AlertTriangle,
  Clock, CheckCircle, Search, Plus, Edit, Trash, Eye, Lock
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InlineLoader } from '@/components/ui/LoadingOverlay';

const UserRow = ({ user, onEdit, onDelete }) => (
  <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
    <td className="px-4 py-3 whitespace-nowrap">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-medium">
          {user.firstName?.[0]}{user.lastName?.[0]}
        </div>
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {user.firstName} {user.lastName}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
        </div>
      </div>
    </td>
    <td className="px-4 py-3 whitespace-nowrap">
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        user.role === 'super_admin' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' :
        user.role === 'branch_manager' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
        user.role === 'fraud_analyst' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
      }`}>
        {user.role.replace('_', ' ')}
      </span>
    </td>
    <td className="px-4 py-3 whitespace-nowrap">
      {user.isActive ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          Active
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <div className="h-2 w-2 rounded-full bg-gray-400" />
          Inactive
        </span>
      )}
    </td>
    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
      {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
    </td>
    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
      <div className="flex items-center justify-end gap-2">
        <button className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300">
          <Eye className="h-4 w-4" />
        </button>
        <button className="text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300">
          <Edit className="h-4 w-4" />
        </button>
        <button 
          onClick={() => onDelete(user.id)}
          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
        >
          <Trash className="h-4 w-4" />
        </button>
      </div>
    </td>
  </tr>
);

const ServiceStatus = ({ name, status, latency }) => (
  <Card>
    <CardHeader className="pb-2">
      <div className="flex items-center justify-between">
        <CardTitle className="text-sm font-medium">{name}</CardTitle>
        <div className={`flex items-center gap-2 text-xs ${
          status === 'healthy' ? 'text-emerald-600' :
          status === 'warning' ? 'text-amber-600' :
          'text-red-600'
        }`}>
          <div className={`h-2 w-2 rounded-full ${
            status === 'healthy' ? 'bg-emerald-500' :
            status === 'warning' ? 'bg-amber-500' :
            'bg-red-500'
          }`} />
          {status.toUpperCase()}
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>Latency: {latency}ms</span>
        <span>{status === 'healthy' ? 'All systems operational' : status === 'warning' ? 'Degraded performance' : 'Service degraded'}</span>
      </div>
    </CardContent>
  </Card>
);

const SuperAdminDashboard = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [serviceStatus, setServiceStatus] = useState({
    backend: 'healthy',
    mlService: 'healthy',
    database: 'healthy'
  });

  const fetchUsers = async () => {
    try {
      // In production, this would call GET /api/users
      const mockUsers = [
        {
          id: 'user-001',
          firstName: 'Super',
          lastName: 'Admin',
          email: 'superadmin@bankshield.internal',
          role: 'super_admin',
          isActive: true,
          lastLogin: '2026-10-13T14:00:00Z'
        },
        {
          id: 'user-002',
          firstName: 'Branch',
          lastName: 'Manager',
          email: 'manager@bankshield.internal',
          role: 'branch_manager',
          isActive: true,
          lastLogin: '2026-10-13T10:30:00Z'
        },
        {
          id: 'user-003',
          firstName: 'Fraud',
          lastName: 'Analyst',
          email: 'fraud@bankshield.internal',
          role: 'fraud_analyst',
          isActive: true,
          lastLogin: '2026-10-13T11:45:00Z'
        },
        {
          id: 'user-004',
          firstName: 'Customer',
          lastName: 'User',
          email: 'customer@bankshield.internal',
          role: 'customer',
          isActive: true,
          lastLogin: '2026-10-13T09:15:00Z'
        },
        {
          id: 'user-005',
          firstName: 'Old',
          lastName: 'Admin',
          email: 'oldadmin@example.com',
          role: 'admin',
          isActive: false,
          lastLogin: '2026-10-10T16:30:00Z'
        }
      ];
      setUsers(mockUsers);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkServices = async () => {
    try {
      // In production, this would call health endpoints
      setServiceStatus({
        backend: 'healthy',
        mlService: 'healthy',
        database: 'healthy'
      });
    } catch (err) {
      console.error('Service check failed:', err);
    }
  };

  useEffect(() => {
    fetchUsers();
    checkServices();
  }, []);

  const handleDeleteUser = (userId) => {
    if (confirm('Are you sure you want to delete this user?')) {
      setUsers(prev => prev.filter(u => u.id !== userId));
    }
  };

  const stats = {
    totalUsers: users.length,
    activeUsers: users.filter(u => u.isActive).length,
    byRole: {
      super_admin: users.filter(u => u.role === 'super_admin').length,
      branch_manager: users.filter(u => u.role === 'branch_manager').length,
      fraud_analyst: users.filter(u => u.role === 'fraud_analyst').length,
      customer: users.filter(u => u.role === 'customer').length
    }
  };

  if (loading) {
    return <InlineLoader label="Loading admin dashboard..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Platform Administration
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          System configuration, user management, and infrastructure monitoring
        </p>
      </div>

      {/* Service Status */}
      <div className="grid gap-4 sm:grid-cols-3">
        <ServiceStatus 
          name="Backend API" 
          status={serviceStatus.backend} 
          latency={Math.floor(Math.random() * 50) + 20} 
        />
        <ServiceStatus 
          name="ML Service" 
          status={serviceStatus.mlService} 
          latency={Math.floor(Math.random() * 30) + 10} 
        />
        <ServiceStatus 
          name="Database" 
          status={serviceStatus.database} 
          latency={Math.floor(Math.random() * 15) + 5} 
        />
      </div>

      {/* System Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Users
            </CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.totalUsers}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {stats.activeUsers} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Super Admins
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.byRole.super_admin}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Platform administrators
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Branch Managers
            </CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.byRole.branch_manager}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Branch operations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Fraud Analysts
            </CardTitle>
            <Activity className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.byRole.fraud_analyst}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Investigation team
            </p>
          </CardContent>
        </Card>
      </div>

      {/* User Management */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            User Management
          </CardTitle>
          <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            Add User
          </button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/60 text-left">
                  <th className="px-4 py-3 font-semibold uppercase tracking-wide text-gray-500">User</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wide text-gray-500">Role</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wide text-gray-500">Last Login</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wide text-gray-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {users.map(user => (
                  <UserRow
                    key={user.id}
                    user={user}
                    onDelete={handleDeleteUser}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Security Settings */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-500" />
              Security Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">Password Policy</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Minimum 12 characters, require special chars</div>
              </div>
              <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Enforced</div>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">Session Timeout</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Access token validity</div>
              </div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">15 minutes</div>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">ML Model Auto-Update</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Weekly model retraining</div>
              </div>
              <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Enabled</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Settings className="h-4 w-4 text-purple-500" />
              System Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">Fraud Flag Threshold</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Score ≥ 0.918 triggers review</div>
              </div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">0.918</div>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">Fraud Block Threshold</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Score ≥ 1.118 blocks transaction</div>
              </div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">1.118</div>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">ML Service URL</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Prediction endpoint</div>
              </div>
              <div className="text-xs font-mono text-gray-900 dark:text-white">
                http://localhost:8000
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Audit Log Preview */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Recent Audit Events</CardTitle>
          <Link to="/admin/audit-logs">
            <button className="text-xs text-blue-600 hover:underline dark:text-blue-400">
              View all logs
            </button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/60 text-left">
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Time</th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Event</th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">User</th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Entity</th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {[
                  { time: '2026-10-13 14:00', event: 'USER_LOGIN', user: 'superadmin', entity: 'platform', status: 'success' },
                  { time: '2026-10-13 13:30', event: 'USER_CREATED', user: 'superadmin', entity: 'newuser@company.com', status: 'success' },
                  { time: '2026-10-13 12:15', event: 'LOGIN_FAILED', user: 'oldadmin@example.com', entity: 'user', status: 'failure' },
                  { time: '2026-10-13 11:45', event: 'USER_LOGIN', user: 'fraud', entity: 'platform', status: 'success' },
                  { time: '2026-10-13 10:30', event: 'USER_LOGIN', user: 'manager', entity: 'platform', status: 'success' }
                ].map((log, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{log.time}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-gray-800 dark:text-gray-200">
                      {log.event}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{log.user}</td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{log.entity}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        log.status === 'success' ? 'bg-emerald-100 text-emerald-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link to="/admin/users">
          <Card className="cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="mb-3 rounded-full bg-blue-100 p-3 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Manage Users</h3>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/admin/settings">
          <Card className="cursor-pointer hover:border-purple-300 dark:hover:border-purple-700 transition-colors">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="mb-3 rounded-full bg-purple-100 p-3 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                  <Settings className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">System Settings</h3>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/admin/audit-logs">
          <Card className="cursor-pointer hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="mb-3 rounded-full bg-amber-100 p-3 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                  <Activity className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Audit Logs</h3>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
