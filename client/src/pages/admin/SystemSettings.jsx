/**
 * SystemSettings.jsx — Super admin system configuration page.
 *
 * Features:
 *   • ML model configuration
 *   • Security settings
 *   • System health monitoring
 */

import React from 'react';
import { Settings, ShieldCheck, Activity, Cpu } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

const SystemSettings = () => {
  const [mlAutoUpdate, setMlAutoUpdate] = React.useState(true);
  const [emailNotifications, setEmailNotifications] = React.useState(true);
  const [twoFactorAuth, setTwoFactorAuth] = React.useState(false);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">System Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Configure platform-wide settings and preferences</p>
      </div>

      {/* ML Model Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Cpu className="h-4 w-4 text-purple-500" />
            ML Model Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <div className="text-sm font-medium text-gray-900 dark:text-white">Model Version</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Current: xgboost-v2.0</div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <div className="text-sm font-medium text-gray-900 dark:text-white">Features</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">18 features active</div>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">Auto-Update Model</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Automatically update model weekly</div>
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
            Security Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">Password Policy</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Require special characters, min 12 chars</div>
            </div>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Enforced</span>
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
              <div className="text-sm font-medium text-gray-900 dark:text-white">Two-Factor Auth</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Require 2FA for admin accounts</div>
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
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div className="text-sm font-medium text-gray-900 dark:text-white mb-1">Backend API</div>
            <div className="flex items-center gap-2 text-xs text-emerald-600">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              Healthy
            </div>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div className="text-sm font-medium text-gray-900 dark:text-white mb-1">ML Service</div>
            <div className="flex items-center gap-2 text-xs text-emerald-600">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              Healthy
            </div>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div className="text-sm font-medium text-gray-900 dark:text-white mb-1">Database</div>
            <div className="flex items-center gap-2 text-xs text-emerald-600">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              Healthy
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemSettings;
