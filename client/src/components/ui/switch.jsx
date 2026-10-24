/**
 * switch.jsx — minimal toggle switch component.
 */
import React from 'react';
import { cn } from '@/utils/cn';

export const Switch = ({ checked = false, onCheckedChange, disabled = false, id, className }) => (
  <button
    role="switch"
    type="button"
    id={id}
    aria-checked={checked}
    disabled={disabled}
    onClick={() => !disabled && onCheckedChange?.(!checked)}
    className={cn(
      'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
      'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
      'disabled:cursor-not-allowed disabled:opacity-50',
      checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700',
      className,
    )}
  >
    <span className={cn(
      'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform',
      checked ? 'translate-x-5' : 'translate-x-0',
    )} />
  </button>
);

export default Switch;
