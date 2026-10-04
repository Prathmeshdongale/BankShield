/**
 * FraudAlertCard — compact alert card used in the Dashboard widget.
 * For the full alert page see pages/FraudAlerts.jsx
 */
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button }      from '@/components/ui/button';
import { RiskBadge }   from './RiskBadge';
import { StatusBadge } from '@/components/ui/StatusBadge';

const fmtAmt  = (n,c='INR') => new Intl.NumberFormat('en-IN',{style:'currency',currency:c,maximumFractionDigits:2}).format(n??0);
const fmtDate = (s) => s ? new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(s)) : '—';

export const FraudAlertCard = ({ alert, onUpdateStatus }) => {
  const triggers = (() => {
    try { return typeof alert.trigger_reasons === 'string' ? JSON.parse(alert.trigger_reasons) : (alert.trigger_reasons ?? []); }
    catch { return []; }
  })();

  return (
    <Card className={`border-l-4 ${alert.severity==='critical'?'border-l-red-500':alert.severity==='high'?'border-l-orange-400':'border-l-yellow-400'}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <RiskBadge score={alert.risk_score} />
            <StatusBadge value={alert.status} />
          </div>
          <CardTitle className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {alert.transaction_ref ?? alert.transaction_id?.slice(0,8) ?? 'Unknown transaction'}
          </CardTitle>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {fmtDate(alert.created_at)}
            {alert.source_account_number && ` · ${alert.source_account_number}`}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm gap-4">
          <div>
            <span className="text-gray-500 text-xs">Amount: </span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {fmtAmt(alert.amount, alert.currency)}
            </span>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline"
              onClick={() => onUpdateStatus?.(alert.id, 'false_positive')}>
              Dismiss
            </Button>
            <Button size="sm" variant="destructive"
              onClick={() => onUpdateStatus?.(alert.id, 'confirmed_fraud')}>
              Confirm Fraud
            </Button>
          </div>
        </div>
        {triggers.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {triggers.slice(0,3).map(t => (
              <span key={t} className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700 dark:bg-red-950/30 dark:text-red-400">
                {t}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FraudAlertCard;
