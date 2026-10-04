import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * ErrorMessage — inline error display used in forms and pages.
 *
 * Props:
 *   message   string | null   — if null/empty, renders nothing
 *   title     string          — optional heading (default 'Error')
 *   onDismiss () => void      — if provided, shows an X button
 *   className string
 */
export const ErrorMessage = ({ message, title = 'Error', onDismiss, className }) => {
  if (!message) return null;

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3',
        'dark:border-red-800 dark:bg-red-950/40',
        className
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
      <div className="flex-1 text-sm text-red-700 dark:text-red-300">
        {title && <p className="font-semibold">{title}</p>}
        <p>{message}</p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="ml-auto shrink-0 text-red-500 hover:text-red-700 dark:text-red-400"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

/**
 * FieldError — tiny error text shown below a form field.
 */
export const FieldError = ({ message, className }) => {
  if (!message) return null;
  return (
    <p role="alert" className={cn('mt-1 text-xs text-red-600 dark:text-red-400', className)}>
      {message}
    </p>
  );
};

export default ErrorMessage;
