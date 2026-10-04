/**
 * CustomerTable — paginated customer list with inline actions.
 */
import React from 'react';
import { useNavigate }  from 'react-router-dom';
import { Eye, UserX, MoreHorizontal } from 'lucide-react';
import { StatusBadge }  from '@/components/ui/StatusBadge';
import { Pagination }   from '@/components/ui/Pagination';
import { Button }       from '@/components/ui/button';
import { InlineLoader } from '@/components/ui/LoadingOverlay';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { useAuth }      from '@/context/AuthContext';
import { cn }           from '@/utils/cn';

const WRITE_ROLES = ['super_admin', 'admin', 'compliance_officer', 'branch_manager'];

export const CustomerTable = ({ customers, pagination, loading, error, filters, onPageChange, onDeactivate }) => {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canWrite  = hasRole(WRITE_ROLES);

  if (loading) return <InlineLoader label="Loading customers…" />;
  if (error)   return <ErrorMessage message={error} />;

  if (!customers.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
        <p className="text-sm">No customers found.</p>
        {(filters.search || filters.segment || filters.riskRating) && (
          <p className="text-xs">Try adjusting your filters.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left dark:border-gray-800 dark:bg-gray-900">
              {['Customer #','Name','Email','Risk','Segment','Joined',''].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {customers.map(c => (
              <tr
                key={c.id}
                onClick={() => navigate(`/customers/${c.id}`)}
                className="cursor-pointer bg-white transition-colors hover:bg-blue-50/40 dark:bg-gray-900 dark:hover:bg-gray-800/60"
              >
                <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                  {c.customer_number}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                  {c.first_name} {c.last_name}
                  {c.is_pep && (
                    <span className="ml-1.5 rounded bg-orange-100 px-1 text-[10px] font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                      PEP
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{c.email}</td>
                <td className="px-4 py-3"><StatusBadge value={c.risk_rating} /></td>
                <td className="px-4 py-3"><StatusBadge value={c.segment} /></td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                  {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => navigate(`/customers/${c.id}`)}
                      aria-label="View customer"
                      className="h-8 w-8 text-gray-400 hover:text-blue-600"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeactivate(c)}
                        aria-label="Deactivate customer"
                        className="h-8 w-8 text-gray-400 hover:text-red-600"
                      >
                        <UserX className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && (
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>
            {pagination.total} customer{pagination.total !== 1 ? 's' : ''} total
          </span>
          <Pagination
            page={pagination.page}
            pages={pagination.pages}
            onPage={p => onPageChange(p)}
          />
        </div>
      )}
    </div>
  );
};

export default CustomerTable;
