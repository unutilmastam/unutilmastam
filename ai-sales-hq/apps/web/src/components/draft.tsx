'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Pill } from '@/components/shell';
import { api } from '@/lib/api';
import { phone as fmtPhone, type ProspectContact } from '@/lib/prospects';
import { t } from '@/lib/strings';

export interface DraftMessage {
  id: string;
  body: string;
  status: 'DRAFT' | 'NEEDS_EDIT';
  checks: { code: string; detail: string }[] | null;
  generatedBy: string | null;
}

const CHANNELS = ['PHONE_CALL', 'SMS', 'TELEGRAM', 'IN_PERSON'] as const;

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Assisted-manual outreach (A5): the owner reads the draft, opens his own phone app or Telegram
 * with it, then confirms here. Nothing is sent by the server.
 */
export function DraftCard({
  message,
  prospect,
  onChange,
  showProspect = false,
}: {
  message: DraftMessage;
  prospect: { id: string; name: string; contacts: ProspectContact[] };
  onChange: () => void;
  showProspect?: boolean;
}) {
  const [body, setBody] = useState(message.body);
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>('PHONE_CALL');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = body !== message.body;
  const blocked = message.status === 'NEEDS_EDIT' || dirty;
  const phones = prospect.contacts.filter((c) => c.kind === 'PHONE');
  const tg = prospect.contacts.find((c) => c.kind === 'TELEGRAM');

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const link = 'inline-flex min-h-10 items-center rounded-xl border border-line px-3 text-sm hover:border-line-strong';
  return (
    <div className="grid gap-2">
      {showProspect && (
        <div className="flex items-center justify-between gap-2">
          <Link href={`/prospects/view/?id=${prospect.id}`} className="font-semibold text-gold">
            {prospect.name}
          </Link>
          <span className="text-xs text-mist">
            {message.generatedBy ? t.outreach.generatedBy(message.generatedBy) : ''}
          </span>
        </div>
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={Math.min(12, Math.max(4, body.split('\n').length + 1))}
        aria-label={t.conversation.title}
        className="input-area w-full leading-relaxed"
      />
      {message.checks && message.checks.length > 0 && !dirty && (
        <div className="rounded-xl border border-warn/50 p-3 text-sm">
          <p className="mb-1 text-warn">{t.outreach.checks}</p>
          <ul className="list-disc pl-5 text-mist">
            {message.checks.map((c) => (
              <li key={c.detail}>{c.detail}</li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
      {note && <p className="text-sm text-ok">{note}</p>}
      <div className="flex flex-wrap gap-2">
        {dirty && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => run(() => api(`/messages/${message.id}/edit`, { method: 'POST', body: { body } }))}
          >
            {t.outreach.save}
          </button>
        )}
        {!blocked && (
          <>
            <button
              type="button"
              className={link}
              onClick={async () => setNote((await copy(body)) ? t.outreach.copied : null)}
            >
              {t.outreach.copy}
            </button>
            {phones.map((p) => (
              <span key={p.id} className="contents">
                <a className={link} href={`tel:${p.value}`} onClick={() => setChannel('PHONE_CALL')}>
                  {t.outreach.call} {fmtPhone(p.value)}
                </a>
                <a
                  className={link}
                  href={`sms:${p.value}?&body=${encodeURIComponent(body)}`}
                  onClick={() => setChannel('SMS')}
                >
                  {t.outreach.sms}
                </a>
              </span>
            ))}
            {tg && (
              <a
                className={link}
                href={`https://t.me/${tg.value}`}
                target="_blank"
                rel="noreferrer noopener"
                onClick={async () => {
                  setChannel('TELEGRAM');
                  if (await copy(body)) setNote(t.outreach.telegramHint);
                }}
              >
                {t.outreach.telegram} @{tg.value}
              </a>
            )}
          </>
        )}
      </div>
      {!blocked && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as (typeof CHANNELS)[number])}
            aria-label={t.outreach.channel}
            className="input px-2"
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {t.outreach.channels[c]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => run(() => api(`/messages/${message.id}/sent`, { method: 'POST', body: { channel } }))}
          >
            {t.outreach.markSent}
          </button>
          <button
            type="button"
            className="btn btn-secondary text-mist"
            onClick={() => run(() => api(`/messages/${message.id}/discard`, { method: 'POST' }))}
          >
            {t.outreach.discard}
          </button>
        </div>
      )}
      {message.status === 'NEEDS_EDIT' && !dirty && <Pill tone="warn">{t.outreach.checks}</Pill>}
    </div>
  );
}
