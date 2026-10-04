/**
 * StatusBadge — coloured pill for statuses, severities, risk ratings, etc.
 */
import React from 'react';
import { cn } from '@/utils/cn';

const PRESET = {
  // KYC status
  pending  : 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300',
  submitted: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300',
  verified : 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300',
  rejected : 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300',
  expired  : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400',
  // Risk rating
  low      : 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300',
  medium   : 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300',
  high     : 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300',
  very_high: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300',
  critical : 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300',
  // Segments
  retail   : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
  premium  : 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300',
  corporate: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300',
  vip      : 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300',
  // Generic
  active   : 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300',
  inactive : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400',
  frozen   : 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300',
  closed   : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400',
  blocked  : 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300',
  flagged  : 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300',
  completed: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300',
};

export const StatusBadge = ({ value, label, className }) => {
  const key   = String(value ?? '').toLowerCase().replace(/\s+/g, '_');
  const style = PRESET[key] ?? 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300';
  const text  = label ?? String(value ?? '').replace(/_/g, ' ');
  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize',
      style, className
    )}>
      {text}
    </span>
  );
};

export default StatusBadge;
