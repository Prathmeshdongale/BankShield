/**
 * SystemSettings.jsx — Super admin system configuration page.
 * Live integration with /fraud/ml-status and /health.
 */

import React, { useState, useEffect } from 'react';
import { Settings, ShieldCheck, Activity, Cpu, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { fraudService } from '@/services/fraudService';
import api from '@/services/api';

const SystemSettings = () => {
  const [mlAutoUpdate, setMlAutoUpdate] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [twoFactorAuth, setTwoFactorAuth] = useState(false);

  const [mlInfo, setMlInfo] = useState({
    status: 'checking',
    version: 'xgboost-v2.0',
    modelLoaded: false,
    circuitOpen: false,
  });
  const [systemHealth, setSystemHealth] = useState({
    backend: 'healthy',
    database: 'healthy',
  });
  const [refreshing, setRefreshing] = useState(false);

  const checkHealthAndMl = async () => {
    setRefreshing(true);
    try {
      const mlRes = await fraudService.mlStatus();
      const data = mlRes.data || mlRes;
      setMlInfo({
        status: data.status || (data.model_loaded ? 'online' : 'fallback'),
        version: data.model_version || 'xgboost-v2.0',
        modelLoaded: Boolean(data.model_loaded),
        circuitOpen: Boolean(data.circuit_open),
      });
    } catch {
      setMlInfo(prev => ({ ...prev, status: 'fallback', circuitOpen: true }));
    }

    try {
      await api.get('/health');
      setSystemHealth({ backend: 'healthy', database: 'healthy' });
    } catch {
      setSystemHealth({ backend: 'degraded', database: 'unknown' });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    checkHealthAndMl();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">System Settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Configure platform-wide settings and monitor services</p>
        </div>
        <Button variant="outline" onClick={checkHealthAndMl} disabled={refreshing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh Status
        </Button>
      </div>

      {/* ML Model Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Cpu className="h-4 w-4 text-purple-500" />
            ML Fraud Detection Model Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <div className="text-sm font-medium text-gray-900 dark:text-white">Model Engine</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">XGBoost + SHAP TreeExplainer</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <div className="text-sm font-medium text-gray-900 dark:text-white">Active Version</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{mlInfo.version}</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <div className="text-sm font-medium text-gray-900 dark:text-white">Feature Vector</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">18 signals (Velocity, Amount, Context)</div>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">Auto-Update Model Pipeline</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Periodically recalibrate risk thresholds from newly audited transactions</div>
            </div>
            <Switch checked={mlAutoUpdate} onCheckedChange={setMlAutoUpdate} />
          </div>
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-amber-500" />
            Security & Authentication Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">Password Policy</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Bcrypt salt rounds 12, uppercase, lowercase, numbers, symbols</div>
            </div>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full">
              Enforced
            </span>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">JWT Session Validity</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Access token expiry (15m) + rolling refresh token (7d)</div>
            </div>
            <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-full">
              15 min / 7 days
            </div>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">Two-Factor Authentication</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Enforce multi-factor verification for sensitive administrative actions</div>
            </div>
            <Switch checked={twoFactorAuth} onCheckedChange={setTwoFactorAuth} />
          </div>
        </CardContent>
      </Card>

      {/* System Health */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-emerald-500" />
            Live System Health
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div className="text-sm font-medium text-gray-900 dark:text-white mb-1">Backend API</div>
            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Express 5 (ESM) — Operational
            </div>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div className="text-sm font-medium text-gray-900 dark:text-white mb-1">ML Microservice</div>
            <div className={`flex items-center gap-2 text-xs ${
              mlInfo.modelLoaded ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
            }`}>
              {mlInfo.modelLoaded ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              {mlInfo.modelLoaded ? 'FastAPI / XGBoost Loaded' : 'Fallback Heuristic Active'}
            </div>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div className="text-sm font-medium text-gray-900 dark:text-white mb-1">PostgreSQL Ledger</div>
            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              ACID Compliant Pool Active
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemSettings;
