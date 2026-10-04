/**
 * CustomerFilters — search bar + dropdown filters above the customer table.
 */
import React from 'react';
import { Search, X } from 'lucide-react';
import { Input }  from '@/components/ui/input';
import Select     from '@/components/ui/Select';
import { Button } from '@/components/ui/button';
import { cn }     from '@/utils/cn';

const SEGMENTS     = ['', 'retail', 'premium', 'corporate', 'vip'];
const RISK_RATINGS = ['', 'low', 'medium', 'high', 'very_high'];

export const CustomerFilters = ({ filters, onChange, loading }) => {
  const hasActive = filters.search || filters.segment || filters.riskRating;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative flex-1 min-w-[220px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search name, email, customer #…"
          value={filters.search}
          onChange={e => onChange({ search: e.target.value })}
          className="pl-9 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
          aria-label="Search customers"
        />
      </div>

      {/* Segment */}
      <Select
        value={filters.segment}
        onChange={e => onChange({ segment: e.target.value })}
        aria-label="Filter by segment"
        className="w-36"
      >
        <option value="">All segments</option>
        {SEGMENTS.slice(1).map(s => (
          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
        ))}
      </Select>

      {/* Risk rating */}
      <Select
        value={filters.riskRating}
        onChange={e => onChange({ riskRating: e.target.value })}
        aria-label="Filter by risk rating"
        className="w-36"
      >
        <option value="">All risk levels</option>
        {RISK_RATINGS.slice(1).map(r => (
          <option key={r} value={r}>{r.replace('_', ' ')}</option>
        ))}
      </Select>

      {/* Sort */}
      <Select
        value={filters.sortDir}
        onChange={e => onChange({ sortDir: e.target.value })}
        aria-label="Sort direction"
        className="w-32"
      >
        <option value="DESC">Newest first</option>
        <option value="ASC">Oldest first</option>
      </Select>

      {/* Clear */}
      {hasActive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ search: '', segment: '', riskRating: '', page: 1 })}
          aria-label="Clear filters"
          className="gap-1.5 text-gray-500"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
};

export default CustomerFilters;
