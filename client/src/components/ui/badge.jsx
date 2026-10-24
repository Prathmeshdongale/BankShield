import React from 'react';
import { cn } from '@/utils/cn';

export const Badge = ({ className, variant = 'default', children, ...props }) => {
  const variants = {
    default:
      'bg-blue-100 text-blue-800 border-blue-200 ' +
      'dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700/50',

    secondary:
      'bg-slate-100 text-slate-800 border-slate-200 ' +
      'dark:bg-slate-700/60 dark:text-slate-300 dark:border-slate-600/50',

    success:
      'bg-emerald-100 text-emerald-800 border-emerald-200 ' +
      'dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700/50',

    warning:
      'bg-amber-100 text-amber-800 border-amber-200 ' +
      'dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700/50',

    destructive:
      'bg-red-100 text-red-800 border-red-200 ' +
      'dark:bg-red-900/40 dark:text-red-300 dark:border-red-700/50',

    outline:
      'text-slate-900 border-slate-300 bg-transparent ' +
      'dark:text-slate-200 dark:border-slate-600',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export default Badge;
