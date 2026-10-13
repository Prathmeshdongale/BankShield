/**
 * FraudAnalystDashboard.jsx — Fraud investigation dashboard.
 *
 * Features:
 *   • Fraud alert triage and prioritization
 *   • ML prediction scores and explanations
 *   • Investigation case management
 *   • SHAP-based feature contribution analysis
 *   • Alert status updates
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  AlertTriangle, ShieldCheck, Activity, BrainCircuit,
  Clock, CheckCircle, XCircle, Search
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RiskBadge } from '@/components/fraud/RiskBadge';
import { InlineLoader } from '@/components/ui/LoadingOverlay';

const AlertCard = ({ alert, onAction }) => (
  <Card className="hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between">
        <div>
          <CardTitle className="text-sm font-semibold">Transaction Alert</CardTitle>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            ID: {alert.id} • {alert.transaction_ref}
          </p>
        </div>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
          alert.severity === 'high' ? 'bg-orange-100 text-orange-800' :
          alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
          'bg-blue-100 text-blue-800'
        }`}>
          {alert.severity.toUpperCase()}
        </span>
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      {/* Risk Score */}
      <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg">
        <span className="text-sm text-gray-600 dark:text-gray-400">Risk Score</span>
        <RiskBadge score={alert.risk_score} showScore />
      </div>

      {/* Transaction Details */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-500 uppercase">Transaction Details</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Amount:</span>
            <span className="ml-2 font-medium text-gray-900 dark:text-white">
              ₹{alert.amount?.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Channel:</span>
            <span className="ml-2 font-medium text-gray-900 dark:text-white">
              {alert.channel || 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Time:</span>
            <span className="ml-2 font-medium text-gray-900 dark:text-white">
              {new Date(alert.created_at).toLocaleTimeString()}
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Customer:</span>
            <span className="ml-2 font-medium text-gray-900 dark:text-white truncate max-w-[100px]">
              {alert.customer_name}
            </span>
          </div>
        </div>
      </div>

      {/* ML Prediction Info */}
      {alert.model_version && (
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
          <div className="flex items-center gap-2 mb-2">
            <BrainCircuit className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">ML Prediction</span>
          </div>
          <div className="text-xs text-blue-800 dark:text-blue-200">
            <p>Model: {alert.model_version}</p>
            <p>Decision: {alert.decision || 'REVIEW'}</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <Link to={`/fraud/alerts/${alert.id}/investigate`}>
          <button className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700">
            <Activity className="h-4 w-4" />
            Investigate
          </button>
        </Link>
        <button 
          onClick={() => onAction(alert.id, 'approve')}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
        >
          <CheckCircle className="h-4 w-4" />
        </button>
        <button 
          onClick={() => onAction(alert.id, 'block')}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
        >
          <XCircle className="h-4 w-4" />
        </button>
      </div>
    </CardContent>
  </Card>
);

const FraudAnalystDashboard = () => {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, open, investigating, needs_review

  const fetchAlerts = async () => {
    try {
      // In production, this would call GET /api/fraud/alerts
      const mockAlerts = [
        {
          id: 'ALT-001',
          transaction_ref: 'TXN-20261013-001',
          customer_name: 'Rahul Sharma',
          amount: 150000,
          risk_score: 0.92,
          severity: 'critical',
          status: 'open',
          channel: 'online',
          created_at: '2026-10-13T10:30:00Z',
          model_version: 'xgboost-v2.0',
          decision: 'BLOCK'
        },
        {
          id: 'ALT-002',
          transaction_ref: 'TXN-20261013-002',
          customer_name: 'Priya Patel',
          amount: 75000,
          risk_score: 0.78,
          severity: 'high',
          status: 'open',
          channel: 'mobile',
          created_at: '2026-10-13T09:15:00Z',
          model_version: 'xgboost-v2.0',
          decision: 'REVIEW'
        },
        {
          id: 'ALT-003',
          transaction_ref: 'TXN-20261013-003',
          customer_name: 'Amit Kumar',
          amount: 45000,
          risk_score: 0.55,
          severity: 'medium',
          status: 'investigating',
          channel: 'atm',
          created_at: '2026-10-13T08:45:00Z',
          model_version: 'xgboost-v2.0',
          decision: 'REVIEW'
        },
        {
          id: 'ALT-004',
          transaction_ref: 'TXN-20261013-004',
          customer_name: 'Sneha Rao',
          amount: 200000,
          risk_score: 0.35,
          severity: 'low',
          status: 'open',
          channel: 'branch',
          created_at: '2026-10-13T11:20:00Z',
          model_version: 'xgboost-v2.0',
          decision: 'APPROVE'
        },
        {
          id: 'ALT-005',
          transaction_ref: 'TXN-20261012-100',
          customer_name: 'Vikram Singh',
          amount: 500000,
          risk_score: 0.85,
          severity: 'high',
          status: 'investigating',
          channel: 'online',
          created_at: '2026-10-12T16:30:00Z',
          model_version: 'xgboost-v2.0',
          decision: 'REVIEW'
        }
      ];

      // Filter alerts
      const filtered = mockAlerts.filter(alert => {
        if (filter === 'all') return true;
        if (filter === 'open') return alert.status === 'open';
        if (filter === 'investigating') return alert.status === 'investigating';
        if (filter === 'needs_review') return alert.status === 'open' && alert.severity !== 'low';
        return true;
      });

      setAlerts(filtered);
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [filter]);

  const handleAlertAction = (alertId, action) => {
    console.log(`Action ${action} on alert ${alertId}`);
    // In production, this would call PATCH /api/fraud/alerts/:id
    fetchAlerts(); // Refresh after action
  };

  const stats = {
    total: alerts.length,
    open: alerts.filter(a => a.status === 'open').length,
    investigating: alerts.filter(a => a.status === 'investigating').length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    high: alerts.filter(a => a.severity === 'high').length
  };

  if (loading) {
    return <InlineLoader label="Loading fraud alerts..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Fraud Investigation Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ML-powered fraud detection with SHAP explanations
          </p>
        </div>
        <div className="flex gap-2">
          {['all', 'open', 'investigating', 'needs_review'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {f.replace('_', ' ').toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Alerts</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500 dark:text-gray-400">Open</div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{stats.open}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500 dark:text-gray-400">Investigating</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{stats.investigating}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500 dark:text-gray-400">Critical</div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{stats.critical}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500 dark:text-gray-400">High Severity</div>
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">{stats.high}</div>
          </CardContent>
        </Card>
      </div>

      {/* Alert Queue */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Alert Queue</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {alerts.length} alerts to review
          </span>
        </div>

        {alerts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ShieldCheck className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No alerts matching your filter.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {alerts.map(alert => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onAction={handleAlertAction}
              />
            ))}
          </div>
        )}
      </div>

      {/* ML Model Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <BrainCircuit className="h-4 w-4 text-purple-500" />
            ML Model Status
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div className="text-sm text-gray-500 dark:text-gray-400">Model Version</div>
            <div className="font-mono text-sm font-medium text-gray-900 dark:text-white mt-1">xgboost-v2.0</div>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div className="text-sm text-gray-500 dark:text-gray-400">Features</div>
            <div className="font-mono text-sm font-medium text-gray-900 dark:text-white mt-1">18</div>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div className="text-sm text-gray-500 dark:text-gray-400">Last Updated</div>
            <div className="text-sm font-medium text-gray-900 dark:text-white mt-1">2026-10-10</div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/60 text-left">
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Time</th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Alert</th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Customer</th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Risk</th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {alerts.slice(0, 5).map(alert => (
                  <tr key={alert.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">
                      {new Date(alert.created_at).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-gray-600 dark:text-gray-300">
                      {alert.transaction_ref}
                    </td>
                    <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200">
                      {alert.customer_name}
                    </td>
                    <td className="px-4 py-2.5">
                      <RiskBadge score={alert.risk_score} />
                    </td>
                    <td className="px-4 py-2.5 capitalize text-gray-600 dark:text-gray-400">
                      {alert.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FraudAnalystDashboard;
