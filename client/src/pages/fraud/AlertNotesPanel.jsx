/**
 * AlertNotesPanel — list analyst notes + add note form.
 * Used as a shared sub-component for both AlertDetail and InvestigationDetail.
 */
import React, { useState, useEffect } from 'react';
import { MessageSquare, Loader2, Lock, Globe, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { fraudService }  from '@/services/fraudService';
import { Button }        from '@/components/ui/button';
import { useAuth }       from '@/context/AuthContext';
import { InlineLoader }  from '@/components/ui/LoadingOverlay';

const WRITE_ROLES = ['super_admin','admin','compliance_officer','fraud_analyst'];

const fmtDate = (s) => s ? new Date(s).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' }) : '—';

/** Pass either alertId or investigationId */
const AlertNotesPanel = ({ alertId, investigationId }) => {
  const { hasRole, user } = useAuth();
  const canWrite = hasRole(WRITE_ROLES);

  const [notes,    setNotes]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [text,     setText]     = useState('');
  const [internal, setInternal] = useState(true);
  const [posting,  setPosting]  = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = alertId
        ? await fraudService.listAlertNotes(alertId)
        : await fraudService.listInvestigationNotes(investigationId);
      setNotes(res.data?.notes ?? []);
    } catch { /* silent */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [alertId, investigationId]); // eslint-disable-line

  const handleAdd = async () => {
    if (!text.trim()) return;
    setPosting(true);
    try {
      if (alertId) await fraudService.addAlertNote(alertId, text.trim(), internal);
      else         await fraudService.addInvestigationNote(investigationId, text.trim(), internal);
      toast.success('Note added.');
      setText('');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Failed to add note.');
    } finally { setPosting(false); }
  };

  const handleDelete = async (noteId) => {
    try {
      await fraudService.deleteNote(noteId);
      setNotes(n => n.filter(x => x.id !== noteId));
      toast.success('Note deleted.');
    } catch (e) {
      toast.error(e?.response?.data?.error ?? 'Failed to delete note.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Notes list */}
      {loading ? <InlineLoader /> : notes.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-8 text-gray-400">
          <MessageSquare className="h-7 w-7" />
          <p className="text-xs">No notes yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map(n => (
            <div key={n.id}
              className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/40">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {n.author_first_name} {n.author_last_name}
                    </span>
                    <span className="text-[10px] text-gray-400">{fmtDate(n.created_at)}</span>
                    {n.is_internal ? (
                      <span className="flex items-center gap-0.5 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        <Lock className="h-2.5 w-2.5" /> Internal
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        <Globe className="h-2.5 w-2.5" /> Shared
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {n.note_text}
                  </p>
                </div>
                {(n.author_id === user?.id || hasRole(['super_admin','admin'])) && (
                  <button onClick={() => handleDelete(n.id)}
                    className="shrink-0 text-gray-300 hover:text-red-500 dark:text-gray-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add note */}
      {canWrite && (
        <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Add analyst note…"
            rows={3}
            className="w-full resize-none rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
          />
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)}
                className="rounded" />
              Internal only
            </label>
            <Button size="sm" disabled={!text.trim() || posting} onClick={handleAdd} className="gap-1.5">
              {posting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Add Note
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertNotesPanel;
