import React from 'react';
import { cn } from '@/utils/cn';

export const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      // base
      'flex h-10 w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors',
      'placeholder:text-slate-400',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0',
      'disabled:cursor-not-allowed disabled:opacity-50',
      // light
      'border-slate-300 bg-white text-slate-900',
      // dark
      'dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100',
      'dark:placeholder:text-slate-500',
      'dark:focus-visible:ring-blue-400 dark:focus-visible:border-blue-400',
      className
    )}
    {...props}
  />
));

Input.displayName = 'Input';
export default Input;
