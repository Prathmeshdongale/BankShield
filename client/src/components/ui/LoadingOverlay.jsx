import React from 'react';
import { cn }     from '@/utils/cn';
import { Spinner } from './Spinner';

/**
 * LoadingOverlay — full-page semi-transparent overlay while async ops run.
 * Use sparingly; prefer inline spinners for local loading states.
 */
export const LoadingOverlay = ({ message = 'Loading…', className }) => (
  <div
    role="status"
    aria-live="polite"
    className={cn(
      'fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4',
      'bg-white/70 backdrop-blur-sm dark:bg-gray-950/70',
      className
    )}
  >
    <Spinner size="xl" />
    {message && (
      <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{message}</p>
    )}
  </div>
);

/**
 * InlineLoader — centred spinner with optional label for cards / sections.
 */
export const InlineLoader = ({ label = 'Loading…', className }) => (
  <div className={cn('flex flex-col items-center justify-center gap-3 py-16', className)}>
    <Spinner size="lg" />
    <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
  </div>
);

export default LoadingOverlay;
