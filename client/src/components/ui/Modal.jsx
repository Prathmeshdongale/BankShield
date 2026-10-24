/**
 * Modal.jsx — Accessible overlay dialog, fully dark-mode aware.
 */
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

export const Modal = ({ open, onClose, title, children, size = 'md', className }) => {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm dark:bg-black/75"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div className={cn(
        'relative w-full rounded-2xl shadow-2xl',
        'border border-slate-200 bg-white',
        'dark:border-slate-700/60 dark:bg-gray-900',
        'max-h-[90vh] overflow-y-auto',
        sizes[size] ?? sizes.md,
        className
      )}>
        {/* Header */}
        {title && (
          <div className={cn(
            'flex items-center justify-between px-6 py-4',
            'border-b border-slate-100 dark:border-slate-800'
          )}>
            <h2
              id="modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className={cn(
                'rounded-lg p-1.5 transition-colors',
                'text-slate-400 hover:bg-slate-100 hover:text-slate-600',
                'dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300'
              )}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
