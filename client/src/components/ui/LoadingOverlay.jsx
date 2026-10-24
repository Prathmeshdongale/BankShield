/**
 * LoadingOverlay.jsx — Full-page and inline loading states.
 */
import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

/** Full-page spinner overlay */
export const LoadingOverlay = ({ label = 'Loading…' }) => (
  <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-sm dark:bg-gray-950/80">
    <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
    {label && (
      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{label}</p>
    )}
  </div>
);

/** Inline (in-content) spinner — use inside cards/sections */
export const InlineLoader = ({ label = 'Loading…', className }) => (
  <div className={cn('flex flex-col items-center justify-center gap-2 py-10', className)}>
    <Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" />
    {label && (
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
    )}
  </div>
);

/** Tiny spinner for use inside buttons etc. */
export const Spinner = ({ className }) => (
  <Loader2 className={cn('h-4 w-4 animate-spin', className)} />
);

export default LoadingOverlay;
