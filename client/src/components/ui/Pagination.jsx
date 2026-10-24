import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Pagination — numeric page controls, dark-mode aware.
 * Props: page (1-indexed), pages (total), onPage(newPage)
 */
export const Pagination = ({ page, pages, onPage, className }) => {
  if (!pages || pages <= 1) return null;

  const win = 5;
  let start = Math.max(1, page - Math.floor(win / 2));
  let end   = Math.min(pages, start + win - 1);
  if (end - start + 1 < win) start = Math.max(1, end - win + 1);

  const nums = [];
  for (let i = start; i <= end; i++) nums.push(i);

  const btn =
    'flex h-8 min-w-[2rem] items-center justify-center rounded-md border ' +
    'px-2 text-sm font-medium transition-colors disabled:opacity-40 select-none';

  const active =
    'border-blue-600 bg-blue-600 text-white ' +
    'dark:border-blue-500 dark:bg-blue-600';

  const inactive =
    'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 ' +
    'dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 ' +
    'dark:hover:bg-slate-700 dark:hover:border-slate-500';

  const ellipsis = 'px-1 text-slate-400 dark:text-slate-600 select-none';

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
          {start > 2 && <span className={ellipsis}>…</span>}
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
          {end < pages - 1 && <span className={ellipsis}>…</span>}
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
