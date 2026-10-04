import React from 'react';
import { cn } from '@/utils/cn';

const sizes = {
  sm : 'h-4 w-4 border-2',
  md : 'h-6 w-6 border-2',
  lg : 'h-10 w-10 border-[3px]',
  xl : 'h-14 w-14 border-4',
};

export const Spinner = ({ size = 'md', className }) => (
  <div
    role="status"
    aria-label="Loading"
    className={cn(
      'animate-spin rounded-full border-current border-t-transparent text-blue-600 dark:text-blue-400',
      sizes[size] ?? sizes.md,
      className
    )}
  />
);

export default Spinner;
