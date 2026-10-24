import React from 'react';
import { cn } from '@/utils/cn';

export const Alert = ({ className, variant = 'default', children, ...props }) => {
  const variants = {
    default:
      'bg-blue-50 text-blue-900 border-blue-200 ' +
      'dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800/50',

    destructive:
      'bg-red-50 text-red-900 border-red-200 ' +
      'dark:bg-red-950/40 dark:text-red-200 dark:border-red-800/50',

    warning:
      'bg-amber-50 text-amber-900 border-amber-200 ' +
      'dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800/50',

    success:
      'bg-emerald-50 text-emerald-900 border-emerald-200 ' +
      'dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800/50',
  };

  return (
    <div
      role="alert"
      className={cn(
        'relative w-full rounded-lg border p-4 text-sm',
        '[&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4',
        '[&>svg+div]:translate-y-[-3px] [&:has(svg)]:pl-11',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const AlertTitle = ({ className, children, ...props }) => (
  <h5 className={cn('mb-1 font-medium leading-none tracking-tight', className)} {...props}>
    {children}
  </h5>
);

export const AlertDescription = ({ className, children, ...props }) => (
  <div className={cn('text-sm [&_p]:leading-relaxed', className)} {...props}>
    {children}
  </div>
);

export default Alert;
