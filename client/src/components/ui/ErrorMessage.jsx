import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * ErrorMessage — inline error banner.
 * Props: message, title, onDismiss, className
 */
export const ErrorMessage = ({ message, title = 'Error', onDismiss, className }) => {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-lg border px-4 py-3',
        'border-red-200 bg-red-50 text-red-700',
        'dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300',
        className
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        <p>{message}</p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="ml-auto shrink-0 text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

/**
 * FieldError — tiny validation error shown below a form field.
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
