/**
 * CustomerDashboard.jsx — Customer self-service dashboard.
 *
 * Features:
 *   • Account overview and balance
 *   • Recent transactions
 *   • Cards summary
 *   • Fraud alerts for own accounts
 *   • Transaction reporting tools
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  CreditCard, TrendingUp, AlertTriangle, ShieldCheck,
  ArrowUpRight, ArrowDownRight, RefreshCw
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RiskBadge } from '@/components/fraud/RiskBadge';
import { InlineLoader } from '@/components/ui/LoadingOverlay';
import { useTransactions } from '@/hooks/useTransactions';

const fmtAmt = (n) => new Intl.NumberFormat('en-IN', { 
  style: 'currency', currency: 'INR', maximumFractionDigits: 0 
}).format(n ?? 0);

const CustomerDashboard = () => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Get user's transactions via the hook
  const { transactions, loading: txnsLoading, refetch } = useTransactions();

  // In a real app, fetch accounts specific to this customer
  // For now, simulate based on user's branch assignment
  const fetchAccounts = async () => {
    try {
      // This would call GET /api/accounts?customer_id={userId}
      const mockAccounts = [
        {
          id: 'acc-001',
          account_number: 'XXXX-XXXX-1234',
          account_type: 'savings',
          balance: 125000.00,
          status: 'active',
          branch_name: 'Main Branch'
        },
        {
          id: 'acc-002',
          account_number: 'XXXX-XXXX-5678',
          account_type: 'current',
          balance: 45000.00,
          status: 'active',
          branch_name: 'Main Branch'
        }
      ];
      setAccounts(mockAccounts);
    } catch (err) {
      setError('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchAccounts();
    }
  }, [user]);

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  const recentTransactions = transactions?.slice(0, 5) || [];

  if (loading) {
    return <InlineLoader label="Loading dashboard..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Welcome, {user?.firstName}!
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Manage your accounts, view transactions, and report suspicious activity.
        </p>
      </div>

      {/* Account Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Balance
            </CardTitle>
            <CreditCard className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {fmtAmt(totalBalance)}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              across {accounts.length} accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Active Accounts
            </CardTitle>
            <ArrowUpRight className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {accounts.filter(a => a.status === 'active').length}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {accounts.length} total accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Fraud Alerts
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {transactions?.filter(t => t.status === 'flagged' || t.status === 'blocked').length || 0}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              flagged transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Security Status
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-emerald-500" />
              <span className="text-2xl font-bold text-gray-900 dark:text-white">
                Secure
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              All accounts active
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Recent Transactions</CardTitle>
          <Link to="/portal/transactions">
            <button className="text-xs text-blue-600 hover:underline dark:text-blue-400">
              View all
            </button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {txnsLoading ? (
            <div className="p-8 text-center text-sm text-gray-400">
              Loading transactions...
            </div>
          ) : recentTransactions.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No recent transactions.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/60 text-left">
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Ref</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Amount</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Type</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {recentTransactions.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-2.5 font-mono text-[11px] text-gray-600 dark:text-gray-300">
                        {t.transaction_ref || t.id?.slice(0, 8)}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">
                        {fmtAmt(t.amount)}
                      </td>
                      <td className="px-4 py-2.5 capitalize text-gray-600 dark:text-gray-400">
                        {t.txn_type || t.transaction_type}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge value={t.status} />
                      </td>
                      <td className="px-4 py-2.5">
                        <RiskBadge score={t.risk_score} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Account Summary Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Your Accounts</CardTitle>
          <Link to="/portal/accounts">
            <button className="text-xs text-blue-600 hover:underline dark:text-blue-400">
              Manage accounts
            </button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {accounts.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No accounts found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/60 text-left">
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Account</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Type</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Balance</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {accounts.map(acc => (
                    <tr key={acc.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-2.5 font-mono text-gray-800 dark:text-gray-200">
                        {acc.account_number}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 capitalize">
                        {acc.account_type}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">
                        {fmtAmt(acc.balance)}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge value={acc.status} />
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
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 rounded-full bg-blue-100 p-3 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Report Suspicious</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Flag unusual transactions
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 rounded-full bg-emerald-100 p-3 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                <RefreshCw className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Dispute Transaction</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Challenge a charge
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 rounded-full bg-amber-100 p-3 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Account Security</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Manage protection settings
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CustomerDashboard;
