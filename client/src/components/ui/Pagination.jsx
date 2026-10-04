import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Pagination — numeric page controls.
 * Props: page (1-indexed), pages (total), onPage(newPage)
 */
export const Pagination = ({ page, pages, onPage, className }) => {
  if (!pages || pages <= 1) return null;

  const window_size = 5;
  let start = Math.max(1, page - Math.floor(window_size / 2));
  let end   = Math.min(pages, start + window_size - 1);
  if (end - start + 1 < window_size) start = Math.max(1, end - window_size + 1);

  const nums = [];
  for (let i = start; i <= end; i++) nums.push(i);

  const btn = 'flex h-8 min-w-[2rem] items-center justify-center rounded-md border px-2 text-sm transition-colors disabled:opacity-40';
  const active = 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700';
  const inactive = 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700';

  return (
    <nav aria-label="Pagination" className={cn('flex items-center gap-1', className)}>
      <button
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className={cn(btn, inactive)}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {start > 1 && (
        <>
          <button onClick={() => onPage(1)} className={cn(btn, inactive)}>1</button>
          {start > 2 && <span className="px-1 text-gray-400">…</span>}
        </>
      )}

      {nums.map(n => (
        <button
          key={n}
          onClick={() => onPage(n)}
          aria-current={n === page ? 'page' : undefined}
          className={cn(btn, n === page ? active : inactive)}
        >
          {n}
        </button>
      ))}

      {end < pages && (
        <>
          {end < pages - 1 && <span className="px-1 text-gray-400">…</span>}
          <button onClick={() => onPage(pages)} className={cn(btn, inactive)}>{pages}</button>
        </>
      )}

      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= pages}
        aria-label="Next page"
        className={cn(btn, inactive)}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
};

export default Pagination;
