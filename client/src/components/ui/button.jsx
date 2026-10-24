import React from 'react';
import { cn } from '@/utils/cn';

export const Button = React.forwardRef(({
  className,
  variant = 'default',
  size    = 'default',
  children,
  ...props
}, ref) => {
  const base =
    'inline-flex items-center justify-center rounded-lg text-sm font-medium ' +
    'transition-colors focus-visible:outline-none focus-visible:ring-2 ' +
    'focus-visible:ring-blue-500 focus-visible:ring-offset-2 ' +
    'dark:focus-visible:ring-offset-gray-900 ' +
    'disabled:pointer-events-none disabled:opacity-50 cursor-pointer';

  const variants = {
    default:
      'bg-blue-600 text-white shadow-sm ' +
      'hover:bg-blue-700 active:bg-blue-800 ' +
      'dark:bg-blue-600 dark:hover:bg-blue-500 dark:active:bg-blue-700',

    destructive:
      'bg-red-600 text-white shadow-sm ' +
      'hover:bg-red-700 active:bg-red-800 ' +
      'dark:bg-red-700 dark:hover:bg-red-600',

    outline:
      'border border-slate-300 bg-white text-slate-900 shadow-sm ' +
      'hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 ' +
      'dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 ' +
      'dark:hover:bg-slate-700 dark:hover:border-slate-500 dark:active:bg-slate-700',

    secondary:
      'bg-slate-100 text-slate-900 shadow-sm ' +
      'hover:bg-slate-200 active:bg-slate-300 ' +
      'dark:bg-slate-700 dark:text-slate-100 ' +
      'dark:hover:bg-slate-600 dark:active:bg-slate-500',

    ghost:
      'text-slate-700 ' +
      'hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 ' +
      'dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',

    link:
      'text-blue-600 underline-offset-4 hover:underline ' +
      'dark:text-blue-400',
  };

  const sizes = {
    default : 'h-10 px-4 py-2',
    sm      : 'h-8 rounded-md px-3 text-xs',
    lg      : 'h-12 rounded-lg px-8 text-base',
    icon    : 'h-10 w-10',
  };

  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
});

Button.displayName = 'Button';
export default Button;
