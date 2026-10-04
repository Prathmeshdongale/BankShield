/**
 * Notifications.jsx — /notifications
 *
 * Features:
 *   • Paginated inbox with channel + status filters + "unread only" toggle
 *   • Click to mark a single notification read
 *   • "Mark all read" bulk action
 *   • Delete individual notifications
 *   • Empty / loading / error states
 *   • Channel icon mapping (email, sms, push, in_app)
 *   • Unread dot indicator per row
 *
 * APIs used (all from notificationService):
 *   GET    /notifications          list
 *   GET    /notifications/unread-count
 *   PATCH  /notifications/read-all
 *   PATCH  /notifications/:id/read
 *   DELETE /notifications/:id
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell, Mail, MessageSquare, Smartphone, Monitor,
  CheckCheck, Trash2, RefreshCw, BellOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { notificationService } from '@/services/notificationService';
import { Button }              from '@/components/ui/button';
import Select                  from '@/components/ui/Select';
import { Pagination }          from '@/components/ui/Pagination';
import { InlineLoader }        from '@/components/ui/LoadingOverlay';
import { ErrorMessage }        from '@/components/ui/ErrorMessage';
import { cn }                  from '@/utils/cn';

// ── constants ─────────────────────────────────────────────────────────────────
const CHANNELS = ['', 'email', 'sms', 'push', 'in_app'];
const STATUSES = ['', 'pending', 'sent', 'delivered', 'failed', 'read'];
const LIMIT    = 20;

// ── channel icon + colour ─────────────────────────────────────────────────────
const CHANNEL_META = {
  email  : { Icon: Mail,          bg: 'bg-blue-100 dark:bg-blue-950/40',   ic: 'text-blue-600 dark:text-blue-400'   },
  sms    : { Icon: MessageSquare, bg: 'bg-green-100 dark:bg-green-950/40', ic: 'text-green-600 dark:text-green-400' },
  push   : { Icon: Smartphone,    bg: 'bg-purple-100 dark:bg-purple-950/40',ic:'text-purple-600 dark:text-purple-400'},
  in_app : { Icon: Monitor,       bg: 'bg-orange-100 dark:bg-orange-950/40',ic:'text-orange-600 dark:text-orange-400'},
};
const DEFAULT_CH = { Icon: Bell, bg: 'bg-gray-100 dark:bg-gray-800', ic: 'text-gray-500' };

const fmtDate = s =>
  s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

// ─────────────────────────────────────────────────────────────────────────────
const Notifications = () => {
  const [items,      setItems]      = useState([]);
  const [pagination, setPagination] = useState(null);
  const [unread,     setUnread]     = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  // filters
  const [channel,    setChannel]    = useState('');
  const [status,     setStatus]     = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page,       setPage]       = useState(1);

  // in-flight trackers
  const [marking,   setMarking]   = useState('');  // notification id
  const [deleting,  setDeleting]  = useState('');
  const [markingAll,setMarkingAll]= useState(false);

  // ── data ──────────────────────────────────────────────────────────────────
  const loadCount = useCallback(async () => {
    try {
      const r = await notificationService.unreadCount();
      setUnread(r.data?.count ?? 0);
    } catch {}
  }, []);

  const load = useCallback(async (pg = page) => {
    setLoading(true); setError('');
    try {
      const res = await notificationService.list({
        channel    : channel    || undefined,
        status     : status     || undefined,
        unreadOnly : unreadOnly || undefined,
        limit      : LIMIT,
        offset     : (pg - 1) * LIMIT,
      });
      setItems(res.data?.data ?? res.data?.notifications ?? []);
      setPagination(res.data?.pagination ?? null);
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [channel, status, unreadOnly, page]);

  useEffect(() => { load(page); loadCount(); }, [channel, status, unreadOnly, page]); // eslint-disable-line

  // ── actions ───────────────────────────────────────────────────────────────
  const markOne = async (id) => {
    setMarking(String(id));
    try {
      await notificationService.markRead(id);
      setItems(prev => prev.map(n => n.id === id ? { ...n, status: 'read', read_at: new Date().toISOString() } : n));
      setUnread(c => Math.max(0, c - 1));
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Failed to mark as read.');
    } finally { setMarking(''); }
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await notificationService.markAllRead();
      toast.success('All notifications marked as read.');
      setItems(prev => prev.map(n => ({ ...n, status: 'read' })));
      setUnread(0);
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Failed.');
    } finally { setMarkingAll(false); }
  };

  const deleteOne = async (id) => {
    setDeleting(String(id));
    try {
      await notificationService.delete(id);
      setItems(prev => prev.filter(n => n.id !== id));
      setPagination(p => p ? { ...p, total: p.total - 1 } : p);
      toast.success('Notification deleted.');
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Failed to delete.');
    } finally { setDeleting(''); }
  };

  const isUnread = (n) => n.status !== 'read' && !n.read_at;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <Bell className="h-6 w-6 text-blue-600" />
            Notifications
            {unread > 0 && (
              <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            System messages, alerts, and updates.
          </p>
        </div>

        <div className="flex gap-2">
          {unread > 0 && (
            <Button size="sm" variant="outline" onClick={markAll}
              disabled={markingAll} className="gap-1.5">
              {markingAll
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <CheckCheck className="h-3.5 w-3.5" />}
              Mark all read
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => load(page)}
            disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={channel} onChange={e => { setChannel(e.target.value); setPage(1); }} className="w-32">
          {CHANNELS.map(c => (
            <option key={c} value={c}>{c || 'All channels'}</option>
          ))}
        </Select>

        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-32">
          {STATUSES.map(s => (
            <option key={s} value={s}>{s || 'All statuses'}</option>
          ))}
        </Select>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-400 select-none">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={e => { setUnreadOnly(e.target.checked); setPage(1); }}
            className="h-4 w-4 rounded border-gray-300 accent-blue-600"
          />
          Unread only
        </label>
      </div>

      <ErrorMessage message={error} />

      {/* ── List ────────────────────────────────────────────────────────────── */}
      {loading ? (
        <InlineLoader label="Loading notifications…" />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 py-20 text-gray-400 dark:border-gray-700">
          <BellOff className="h-10 w-10" />
          <p className="text-sm font-medium">
            {unreadOnly ? 'No unread notifications.' : 'No notifications found.'}
          </p>
          {unreadOnly && (
            <Button variant="ghost" size="sm" onClick={() => { setUnreadOnly(false); setPage(1); }}>
              Show all notifications
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(n => {
            const ch    = CHANNEL_META[n.channel] ?? DEFAULT_CH;
            const ChIcon = ch.Icon;
            const unreadRow = isUnread(n);
            const isMarking = marking === String(n.id);
            const isDeleting = deleting === String(n.id);

            return (
              <div key={n.id}
                className={cn(
                  'group flex items-start gap-4 rounded-xl border px-4 py-3.5 transition-colors',
                  unreadRow
                    ? 'border-blue-200 bg-blue-50/60 dark:border-blue-800/50 dark:bg-blue-950/20'
                    : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900',
                )}>

                {/* Channel icon */}
                <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', ch.bg)}>
                  <ChIcon className={cn('h-4 w-4', ch.ic)} />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn(
                      'text-sm leading-snug',
                      unreadRow
                        ? 'font-semibold text-gray-900 dark:text-white'
                        : 'font-medium text-gray-700 dark:text-gray-300'
                    )}>
                      {n.title ?? n.subject ?? 'Notification'}
                      {unreadRow && (
                        <span className="ml-2 inline-block h-2 w-2 rounded-full bg-blue-500" aria-label="unread" />
                      )}
                    </p>
                    <span className="shrink-0 text-[11px] text-gray-400">{fmtDate(n.created_at)}</span>
                  </div>

                  {n.body && (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{n.body}</p>
                  )}

                  {/* Meta chips */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] capitalize text-gray-500 dark:border-gray-700 dark:bg-gray-800">
                      {n.channel}
                    </span>
                    <span className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px] capitalize',
                      n.status === 'read'
                        ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400'
                        : n.status === 'failed'
                        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400'
                        : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-800'
                    )}>
                      {n.status}
                    </span>
                    {n.read_at && (
                      <span className="text-[10px] text-gray-400">
                        Read {fmtDate(n.read_at)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {unreadRow && (
                    <button
                      onClick={() => markOne(n.id)}
                      disabled={isMarking}
                      title="Mark as read"
                      className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-100 disabled:opacity-50 dark:hover:bg-blue-900/30">
                      {isMarking
                        ? <RefreshCw className="h-4 w-4 animate-spin" />
                        : <CheckCheck className="h-4 w-4" />}
                    </button>
                  )}
                  <button
                    onClick={() => deleteOne(n.id)}
                    disabled={isDeleting}
                    title="Delete notification"
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/20 dark:hover:text-red-400">
                    {isDeleting
                      ? <RefreshCw className="h-4 w-4 animate-spin" />
                      : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{pagination.total} notification{pagination.total !== 1 ? 's' : ''}</span>
          <Pagination page={pagination.page} pages={pagination.pages} onPage={p => setPage(p)} />
        </div>
      )}
    </div>
  );
};

export default Notifications;
