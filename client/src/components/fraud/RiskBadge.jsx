/**
 * RiskBadge — colour-coded risk score pill.
 * Accepts score as 0-1 float or 0-100 integer.
 */
import React from 'react';
import { cn } from '@/utils/cn';

const tier = (score) => {
  // normalise: if > 1 assume 0-100 scale already
  const s = score > 1 ? score : parseFloat(score ?? 0) * 100;
  if (s >= 80) return { label: 'CRITICAL', cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400' };
  if (s >= 60) return { label: 'HIGH',     cls: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400' };
  if (s >= 30) return { label: 'MEDIUM',   cls: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400' };
  return             { label: 'LOW',       cls: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400' };
};

export const RiskBadge = ({ score, showScore = true, className }) => {
  const norm  = score > 1 ? score : parseFloat(score ?? 0) * 100;
  const { label, cls } = tier(score);
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold',
      cls, className
    )}>
      {label}
      {showScore && <span className="opacity-75 font-mono">{norm.toFixed(1)}%</span>}
    </span>
  );
};

export default RiskBadge;
