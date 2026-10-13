/**
 * BranchManagerDashboard.jsx — Branch operations dashboard.
 *
 * Features:
 *   • Branch overview and operational statistics
 *   • Customer management (own branch only)
 *   • Account oversight
 *   • Fraud review and alert triage
 *   • Branch-level reports
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  Users, Building2, AlertTriangle, TrendingUp, DollarSign,
  RefreshCw, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RiskBadge } from '@/components/fraud/RiskBadge';
import { InlineLoader } from '@/components/ui/LoadingOverlay';

const fmtAmt = (n) => new Intl.NumberFormat('en-IN', { 
  style: 'currency', currency: 'INR', maximumFractionDigits: 0 
}).format(n ?? 0);

const BranchManagerDashboard = () => {
  const { user } = useAuth();
  const [branchData, setBranchData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Simulated data - in production, this would fetch from the API
  const fetchBranchData = async () => {
    try {
      // This would call GET /api/branches/:id/overview
      const mockData = {
        branch: {
          name: 'Main Branch',
          code: 'BR-001',
          customer_count: 450,
          active_accounts: 380,
          total_deposits: 25000000,
          today_transactions: 125
        },
        alerts: [
          { id: 'ALR-001', customer: 'Rahul Sharma', amount: 75000, risk_score: 0.82, status: 'open', severity: 'high' },
          { id: 'ALR-002', customer: 'Priya Patel', amount: 125000, risk_score: 0.65, status: 'investigating', severity: 'medium' },
          { id: 'ALR-003', customer: 'Amit Kumar', amount: 45000, risk_score: 0.35, status: 'open', severity: 'low' }
        ],
        customers: [
          { id: 'CUST-001', name: 'Rahul Sharma', email: 'rahul@example.com', balance: 125000, risk_rating: 'high' },
          { id: 'CUST-002', name: 'Priya Patel', email: 'priya@example.com', balance: 85000, risk_rating: 'medium' },
          { id: 'CUST-003', name: 'Amit Kumar', email: 'amit@example.com', balance: 150000, risk_rating: 'low' }
        ],
        transactions: {
          total_today: 125,
          volume_today: 4500000,
          flagged_today: 3,
          fraud_rate: 2.4
        }
      };
      setBranchData(mockData);
    } catch (err) {
      setError('Failed to load branch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchBranchData();
    }
  }, [user]);

  if (loading) {
    return <InlineLoader label="Loading branch dashboard..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Branch Operations: {branchData?.branch.name}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Branch code: {branchData?.branch.code} | Manager: {user?.firstName} {user?.lastName}
          </p>
        </div>
        <button 
          onClick={fetchBranchData}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Branch Customers
            </CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {branchData?.branch.customer_count.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              +12 this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Deposits
            </CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {fmtAmt(branchData?.branch.total_deposits)}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              across {branchData?.branch.active_accounts} active accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Today's Transactions
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {branchData?.transactions.total_today}
              </div>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center">
                <ArrowUpRight className="h-3 w-3 mr-0.5" />
                {(branchData?.transactions.fraud_rate || 0).toFixed(1)}%
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {fmtAmt(branchData?.transactions.volume_today)} volume
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Open Alerts
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {branchData?.alerts.filter(a => a.status === 'open').length}
              </div>
              <span className="text-xs text-red-600 dark:text-red-400">
                {branchData?.alerts.filter(a => a.severity === 'high').length} critical
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              need review
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Active Fraud Alerts</CardTitle>
          <Link to="/fraud/alerts">
            <button className="text-xs text-blue-600 hover:underline dark:text-blue-400">
              View all alerts
            </button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {branchData?.alerts.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No active alerts. Queue is clear!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/60 text-left">
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Customer</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Amount</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Risk Score</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Severity</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {branchData?.alerts.map(alert => (
                    <tr key={alert.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">
                        {alert.customer}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">
                        {fmtAmt(alert.amount)}
                      </td>
                      <td className="px-4 py-2.5">
                        <RiskBadge score={alert.risk_score} />
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          alert.severity === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                          alert.severity === 'medium' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                          'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}>
                          {alert.severity}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge value={alert.status} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-2">
                          <Link to={`/fraud/alerts/${alert.id}`}>
                            <button className="text-xs text-blue-600 hover:underline dark:text-blue-400">Review</button>
                          </Link>
                          <Link to={`/fraud/alerts/${alert.id}/investigate`}>
                            <button className="text-xs text-gray-600 hover:underline dark:text-gray-400">Investigate</button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customers Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Branch Customers</CardTitle>
          <Link to="/customers">
            <button className="text-xs text-blue-600 hover:underline dark:text-blue-400">
              Manage all
            </button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {branchData?.customers.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No customers found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/60 text-left">
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Customer</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Email</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Balance</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Risk Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {branchData?.customers.map(customer => (
                    <tr key={customer.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">
                        {customer.name}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">
                        {customer.email}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">
                        {fmtAmt(customer.balance)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          customer.risk_rating === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                          customer.risk_rating === 'medium' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                          'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                        }`}>
                          {customer.risk_rating}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Link to="/customers">
          <Card className="cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="mb-3 rounded-full bg-blue-100 p-3 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Customer Onboarding</h3>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/accounts">
          <Card className="cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="mb-3 rounded-full bg-emerald-100 p-3 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <DollarSign className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Accounts</h3>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/fraud/alerts">
          <Card className="cursor-pointer hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="mb-3 rounded-full bg-amber-100 p-3 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Alert Review</h3>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/reports">
          <Card className="cursor-pointer hover:border-purple-300 dark:hover:border-purple-700 transition-colors">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="mb-3 rounded-full bg-purple-100 p-3 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Branch Reports</h3>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
};

export default BranchManagerDashboard;
