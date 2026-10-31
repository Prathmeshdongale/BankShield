/**
 * CardsList — renders cards for a given accountId.
 * Used both standalone (/cards) and as a tab inside AccountDetail.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate }   from 'react-router-dom';
import { CreditCard, Plus, Eye } from 'lucide-react';
import toast from 'react-hot-toast';

import { accountService } from '@/services/accountService';
import { useAuth }        from '@/context/AuthContext';
import { Button }         from '@/components/ui/button';
import { StatusBadge }    from '@/components/ui/StatusBadge';
import { InlineLoader }   from '@/components/ui/LoadingOverlay';
import { ErrorMessage }   from '@/components/ui/ErrorMessage';
import Modal              from '@/components/ui/Modal';
import Select             from '@/components/ui/Select';

const CARD_TYPE_ICONS = { debit:'🏧', credit:'💳', prepaid:'📋', virtual:'🌐' };
const NETWORK_COLORS  = { visa:'text-blue-700', mastercard:'text-red-600', rupay:'text-orange-600', amex:'text-green-700', other:'text-gray-600' };

const IssueCardForm = ({ onSubmit, onCancel }) => {
  const [cardType, setCardType] = useState('debit');
  const [network,  setNetwork]  = useState('rupay');
  const [loading,  setLoading]  = useState(false);
  const submit = async () => {
    setLoading(true);
    try { await onSubmit({ cardType, network }); }
    finally { setLoading(false); }
  };
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Card Type</label>
        <Select value={cardType} onChange={e => setCardType(e.target.value)} className="w-full">
          {['debit','credit','prepaid','virtual'].map(t => <option key={t} value={t}>{t}</option>)}
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Network</label>
        <Select value={network} onChange={e => setNetwork(e.target.value)} className="w-full">
          {['visa','mastercard','rupay','amex','other'].map(n => <option key={n} value={n}>{n}</option>)}
        </Select>
      </div>
      <div className="flex justify-end gap-3 border-t pt-4 dark:border-gray-700">
        <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={submit} disabled={loading} className="gap-2">
          {loading ? 'Issuing…' : 'Issue Card'}
        </Button>
      </div>
    </div>
  );
};

const CardsList = ({ accountId }) => {
  const navigate    = useNavigate();
  const { hasRole } = useAuth();
  const isSuperAdmin = hasRole(['super_admin']);
  const canIssue    = hasRole(['branch_manager','teller']);

  const [cards,    setCards]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [issueOpen,setIssueOpen]= useState(false);
  const [showAll,  setShowAll]  = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true); setError('');
    try {
      const res = await accountService.listCards(accountId, { includeInactive: showAll });
      setCards(res.data?.cards ?? []);
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to load cards.');
    } finally { setLoading(false); }
  }, [accountId, showAll]);

  useEffect(() => { load(); }, [load]);

  const handleIssue = async (data) => {
    await accountService.issueCard(accountId, data);
    toast.success('Card linked and verified.');
    setIssueOpen(false);
    load();
  };

  return (
    <div className="space-y-4">
      {/* Subheader */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="rounded" />
            Show inactive cards
          </label>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5 border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300">
              <Eye className="h-3.5 w-3.5 text-emerald-600" /> Fetch & Analyze Cards
            </Button>
          )}
          {canIssue && (
            <Button size="sm" onClick={() => setIssueOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Link / Issue Card
            </Button>
          )}
        </div>
      </div>

      <ErrorMessage message={error} />

      {loading ? <InlineLoader label="Loading cards…" /> : (
        cards.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
            <CreditCard className="h-8 w-8" />
            <p className="text-sm">No cards on this account.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(card => (
              <div key={card.id}
                className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-800 to-gray-900 p-5 text-white shadow-lg dark:border-gray-700 cursor-pointer hover:shadow-xl transition-shadow"
                onClick={() => navigate(`/cards/${card.id}`)}>
                {/* Card brand */}
                <div className="flex items-center justify-between mb-6">
                  <span className="text-lg">{CARD_TYPE_ICONS[card.card_type] ?? '💳'}</span>
                  <span className={`text-xs font-bold uppercase tracking-wider ${NETWORK_COLORS[card.network] ?? ''} bg-white/10 rounded px-2 py-0.5`}>
                    {card.network}
                  </span>
                </div>
                {/* Masked number */}
                <p className="font-mono text-base tracking-widest text-gray-200">
                  {card.masked_number}
                </p>
                {/* Expiry + status */}
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] uppercase text-gray-400">Expires</p>
                    <p className="text-sm font-medium">
                      {String(card.expiry_month).padStart(2,'0')}/{card.expiry_year}
                    </p>
                  </div>
                  <StatusBadge value={card.status} />
                </div>
                {/* Type chip */}
                <div className="mt-2">
                  <span className="inline-block rounded bg-white/10 px-2 py-0.5 text-[10px] capitalize text-gray-300">
                    {card.card_type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <Modal open={issueOpen} onClose={() => setIssueOpen(false)} title="Issue New Card" size="sm">
        <IssueCardForm onSubmit={handleIssue} onCancel={() => setIssueOpen(false)} />
      </Modal>
    </div>
  );
};

export default CardsList;
