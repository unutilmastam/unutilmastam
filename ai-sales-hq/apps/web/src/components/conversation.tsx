'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { DraftCard, type DraftMessage } from '@/components/draft';
import { Card } from '@/components/shell';
import { api } from '@/lib/api';
import { when } from '@/lib/format';
import type { ProspectContact } from '@/lib/prospects';
import { t } from '@/lib/strings';

interface Message extends Omit<DraftMessage, 'status'> {
  direction: 'OUTBOUND' | 'INBOUND';
  status: DraftMessage['status'] | 'SENT_MANUALLY' | 'RECEIVED' | 'DISCARDED';
  channel: string | null;
  sentAt: string | null;
  createdAt: string;
}
interface ConversationView {
  conversation: { needsOwner: boolean; followUpAt: string | null; messages: Message[] } | null;
  cooldownLeftDays: number;
}

const OUTCOMES = ['INTERESTED', 'NO_ANSWER', 'CALL_BACK', 'NOT_INTERESTED', 'DO_NOT_CONTACT'] as const;

/** Conversation panel on the prospect page: history, the open draft, replies, outcomes. */
export function ConversationPanel({
  prospect,
  canEdit,
  onStageChange,
}: {
  prospect: { id: string; name: string; stage: string; contacts: ProspectContact[] };
  canEdit: boolean;
  onStageChange: () => void;
}) {
  const [view, setView] = useState<ConversationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () => api<ConversationView>(`/prospects/${prospect.id}/conversation`).then(setView),
    [prospect.id],
  );
  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      await load().catch(() => undefined);
      onStageChange();
    }
  };
  const addInbound = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    void run(async () => {
      await api(`/prospects/${prospect.id}/inbound`, {
        method: 'POST',
        body: { body: f.get('body'), channel: f.get('channel') },
      });
      form.reset();
    });
  };

  if (!view) return null;
  const messages = view.conversation?.messages ?? [];
  const open = messages.find((m) => m.direction === 'OUTBOUND' && (m.status === 'DRAFT' || m.status === 'NEEDS_EDIT'));
  const history = messages.filter((m) => m.status === 'SENT_MANUALLY' || m.status === 'RECEIVED');
  const dnc = prospect.stage === 'DO_NOT_CONTACT';
  const btn = 'btn btn-secondary disabled:opacity-50';

  return (
    <Card>
      <h3 className="mb-3 font-semibold">{t.conversation.title}</h3>
      {view.conversation?.needsOwner && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/50 p-3 text-sm">
          <span className="text-warn">{t.conversation.needsOwner}</span>
          {canEdit && (
            <button
              type="button"
              className={btn}
              onClick={() => run(() => api(`/prospects/${prospect.id}/owner-resolved`, { method: 'POST' }))}
            >
              {t.outreach.resolved}
            </button>
          )}
        </div>
      )}
      {error && <p className="mb-2 text-sm text-bad">{error}</p>}
      <ul className="mb-3 grid gap-2">
        {history.map((m) => (
          <li
            key={m.id}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.direction === 'OUTBOUND' ? 'justify-self-end bg-navy' : 'bg-panel'}`}
          >
            <div className="mb-1 text-[11px] text-mist">
              {m.direction === 'OUTBOUND' ? t.conversation.you : t.conversation.them} ·{' '}
              {m.channel ? t.outreach.channels[m.channel] : ''} · {when(m.sentAt ?? m.createdAt)}
            </div>
            {m.body}
          </li>
        ))}
        {history.length === 0 && !open && <li className="text-sm text-mist">{t.conversation.empty}</li>}
      </ul>
      {view.conversation?.followUpAt && (
        <p className="mb-3 text-xs text-mist">
          {t.conversation.followUp}: {when(view.conversation.followUpAt)}
        </p>
      )}
      {open && canEdit && !dnc && (
        <div className="mb-3 rounded-xl border border-gold/30 p-3">
          <DraftCard
            message={{ ...open, status: open.status as DraftMessage['status'] }}
            prospect={prospect}
            onChange={() => void run(async () => undefined)}
          />
        </div>
      )}
      {canEdit && !dnc && (
        <div className="grid gap-3">
          {!open && (
            <div className="flex flex-wrap gap-2">
              {view.cooldownLeftDays > 0 ? (
                <p className="text-sm text-mist">{t.conversation.cooldown(view.cooldownLeftDays)}</p>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    className={btn}
                    onClick={() => run(() => api(`/prospects/${prospect.id}/draft`, { method: 'POST', body: {} }))}
                  >
                    {t.conversation.draft}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={`${btn} text-mist`}
                    onClick={() =>
                      run(() => api(`/prospects/${prospect.id}/draft`, { method: 'POST', body: { strong: true } }))
                    }
                  >
                    {t.conversation.better}
                  </button>
                </>
              )}
              {history.some((m) => m.direction === 'INBOUND') && (
                <button
                  type="button"
                  disabled={busy}
                  className={btn}
                  onClick={() => run(() => api(`/prospects/${prospect.id}/reply-draft`, { method: 'POST', body: {} }))}
                >
                  {t.conversation.reply}
                </button>
              )}
            </div>
          )}
          <form onSubmit={addInbound} className="grid gap-2">
            <textarea
              name="body"
              required
              rows={2}
              placeholder={t.conversation.inboundPlaceholder}
              aria-label={t.conversation.inbound}
              className="input-area"
            />
            <div className="flex gap-2">
              <select name="channel" aria-label={t.conversation.inboundChannel} className="input px-2">
                {Object.entries(t.outreach.channels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={busy} className={btn}>
                {t.conversation.addInbound}
              </button>
            </div>
          </form>
          {history.some((m) => m.direction === 'OUTBOUND') && (
            <div>
              <p className="mb-1 text-xs text-mist">{t.conversation.outcome}</p>
              <div className="flex flex-wrap gap-2">
                {OUTCOMES.map((o) => (
                  <button
                    key={o}
                    type="button"
                    disabled={busy}
                    className={`${btn} ${o === 'DO_NOT_CONTACT' || o === 'NOT_INTERESTED' ? 'text-bad' : o === 'INTERESTED' ? 'text-ok' : ''}`}
                    onClick={() =>
                      run(() => api(`/prospects/${prospect.id}/outcome`, { method: 'POST', body: { outcome: o } }))
                    }
                  >
                    {t.conversation.outcomes[o]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
