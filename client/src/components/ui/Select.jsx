import React from 'react';
import { cn } from '@/utils/cn';
import { ChevronDown } from 'lucide-react';

export const Select = React.forwardRef(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full appearance-none rounded-md border px-3 py-2 pr-8 text-sm shadow-sm',
        'transition-colors focus-visible:outline-none focus-visible:ring-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // light
        'border-slate-300 bg-white text-slate-900',
        'focus-visible:ring-blue-500',
        // dark
        'dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100',
        'dark:focus-visible:ring-blue-400',
        className
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
    />
  </div>
));

Select.displayName = 'Select';
export default Select;
