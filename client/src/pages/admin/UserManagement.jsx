/**
 * UserManagement.jsx — Super admin user management page.
 * Live integration with /api/users.
 */

import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Users, Plus, Edit, Trash, Search, Shield, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Modal from '@/components/ui/Modal';
import { userService } from '@/services/userService';

const ROLES = [
  { value: 'all', label: 'All Roles' },
  { value: 'super_admin', label: 'Super Admin (OTP Verification)' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'fraud_analyst', label: 'Fraud Analyst' },
  { value: 'customer', label: 'Customer' },
];

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [targetRole, setTargetRole] = useState('customer');
  const [submitting, setSubmitting] = useState(false);

  // New user form state
  const [newUser, setNewUser] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    roleName: 'customer',
  });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterRole !== 'all') params.role = filterRole;
      if (searchTerm.trim()) params.search = searchTerm.trim();
      const res = await userService.list(params);
      setUsers(res.data?.data || res.data || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      toast.error('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [filterRole, searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  // Create User
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUser.firstName || !newUser.lastName || !newUser.email || !newUser.password) {
      toast.error('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    try {
      await userService.create(newUser);
      toast.success('User created successfully.');
      setCreateModalOpen(false);
      setNewUser({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        phone: '',
        roleName: 'customer',
      });
      fetchUsers();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to create user.');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle user active status
  const handleToggleStatus = async (user) => {
    const newStatus = !user.is_active;
    try {
      await userService.updateStatus(user.id, newStatus);
      toast.success(`User ${newStatus ? 'activated' : 'deactivated'}.`);
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: newStatus } : u));
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Status update failed.');
    }
  };

  // Change user role
  const handleRoleChange = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      await userService.updateRole(selectedUser.id, targetRole);
      toast.success(`Role updated to ${targetRole.replace('_', ' ')}.`);
      setRoleModalOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update role.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">User Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage platform users, roles, and account security</p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold">Users ({users.length})</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                <Input
                  placeholder="Search name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
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
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        Loading users...
                      </div>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">No users found</td>
                  </tr>
                ) : (
                  users.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-semibold">
                            {u.first_name?.[0] || 'U'}{u.last_name?.[0] || ''}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {u.first_name} {u.last_name}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          u.role_name === 'super_admin' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' :
                          u.role_name === 'branch_manager' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                          u.role_name === 'fraud_analyst' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                          u.role_name === 'teller' ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400' :
                          'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                        }`}>
                          {u.role_display_name || u.role_name?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400">
                            <XCircle className="h-3.5 w-3.5 text-red-400" />
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            title="Change Role"
                            onClick={() => { setSelectedUser(u); setTargetRole(u.role_name); setRoleModalOpen(true); }}
                            className="p-1 rounded text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/30"
                          >
                            <Shield className="h-4 w-4" />
                          </button>
                          <button
                            title={u.is_active ? 'Deactivate User' : 'Activate User'}
                            onClick={() => handleToggleStatus(u)}
                            className={`p-1 rounded ${
                              u.is_active
                                ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30'
                                : 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30'
                            }`}
                          >
                            {u.is_active ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create User Modal */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Add New User"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">First Name *</label>
              <Input
                required
                value={newUser.firstName}
                onChange={(e) => setNewUser(p => ({ ...p, firstName: e.target.value }))}
                placeholder="Jane"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name *</label>
              <Input
                required
                value={newUser.lastName}
                onChange={(e) => setNewUser(p => ({ ...p, lastName: e.target.value }))}
                placeholder="Smith"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
            <Input
              type="email"
              required
              value={newUser.email}
              onChange={(e) => setNewUser(p => ({ ...p, email: e.target.value }))}
              placeholder="jane.smith@bankshield.internal"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Password *</label>
            <Input
              type="password"
              required
              value={newUser.password}
              onChange={(e) => setNewUser(p => ({ ...p, password: e.target.value }))}
              placeholder="Minimum 8 characters"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
              <Input
                value={newUser.phone}
                onChange={(e) => setNewUser(p => ({ ...p, phone: e.target.value }))}
                placeholder="+91 9876543210"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Role *</label>
              <select
                value={newUser.roleName}
                onChange={(e) => setNewUser(p => ({ ...p, roleName: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                {ROLES.filter(r => r.value !== 'all').map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create User'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Change Role Modal */}
      <Modal
        open={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        title="Assign User Role"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Select a new role for <span className="font-semibold text-gray-900 dark:text-white">{selectedUser?.first_name} {selectedUser?.last_name}</span>:
          </p>
          <select
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            {ROLES.filter(r => r.value !== 'all').map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            <Button variant="outline" onClick={() => setRoleModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRoleChange} disabled={submitting}>
              {submitting ? 'Saving...' : 'Update Role'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default UserManagement;
