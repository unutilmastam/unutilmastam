'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useCallback, useEffect, useState } from 'react';
import { ConversationPanel } from '@/components/conversation';
import { AppShell, Card, Pill } from '@/components/shell';
import { Alert, Button } from '@/components/ui';
import { api, type Me } from '@/lib/api';
import { som, when } from '@/lib/format';
import { ORDER_TONE, type OrderRow } from '@/lib/orders';
import { NEXT_STAGES, type ProspectContact, type ProspectRow, phone, STAGE_TONE } from '@/lib/prospects';
import { t } from '@/lib/strings';

interface Detail extends Omit<ProspectRow, 'sources'> {
  notes: string | null;
  contactPersonName: string | null;
  lastVerifiedAt: string | null;
  sources: { id: string; sourceType: string; sourceUrl: string | null; observedAt: string; expiresAt: string | null }[];
  history: { id: number; action: string; details: Record<string, unknown> | null; createdAt: string }[];
}

export default function ProspectPage() {
  return (
    <AppShell title={t.prospects.title}>
      {(me) => (
        <Suspense>
          <Prospect me={me} />
        </Suspense>
      )}
    </AppShell>
  );
}

function Prospect({ me }: { me: Me }) {
  const id = useSearchParams().get('id') ?? '';
  const [p, setP] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canEdit = me.permissions.includes('prospects.edit');

  const load = useCallback(() => api<Detail>(`/prospects/${id}`).then(setP), [id]);
  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!p) return error ? <Alert kind="error">{error}</Alert> : null;
  const addContact = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const form = e.currentTarget;
    void act(async () => {
      await api(`/prospects/${p.id}/contacts`, {
        method: 'POST',
        body: { kind: f.get('kind'), value: f.get('value') },
      });
      form.reset();
    });
  };
  const saveNotes = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const notes = String(new FormData(e.currentTarget).get('notes') ?? '');
    void act(() => api(`/prospects/${p.id}/notes`, { method: 'POST', body: { notes } }));
  };
  const move = (to: string, reason?: string) =>
    act(() => api(`/prospects/${p.id}/stage`, { method: 'POST', body: { to, reason: reason || undefined } }));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid content-start gap-4">
        <Link href="/prospects/" className="text-sm text-gold">
          {t.prospects.back}
        </Link>
        {error && <Alert kind="error">{error}</Alert>}
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold">{p.name}</h2>
              <p className="text-sm text-mist">
                {[t.prospects.category[p.category], p.district, p.address].filter(Boolean).join(' · ')}
              </p>
              <p className="mt-1 text-xs text-mist">
                {t.prospects.location[p.locationQuality]}
                {p.rating !== null && ` · Google ${p.rating} (${p.ratingCount})`}
                {p.isExistingCustomer && ` · ${t.prospects.existing}`}
              </p>
            </div>
            <Pill tone={STAGE_TONE[p.stage] ?? 'muted'}>{t.prospects.stage[p.stage]}</Pill>
          </div>
          {canEdit && p.stage !== 'DO_NOT_CONTACT' && (
            <div className="mt-4 flex flex-wrap gap-2">
              {(NEXT_STAGES[p.stage] ?? []).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => move(s)}
                  className="min-h-10 rounded-xl border border-gold/50 px-3 text-sm text-gold hover:bg-panel"
                >
                  → {t.prospects.stage[s]}
                </button>
              ))}
              <DncButton onConfirm={(reason) => move('DO_NOT_CONTACT', reason)} />
            </div>
          )}
        </Card>

        <ConversationPanel prospect={p} canEdit={canEdit} onStageChange={() => void load().catch(() => undefined)} />

        {me.permissions.includes('orders.view') && (
          <ProspectOrders
            prospectId={p.id}
            canCreate={me.permissions.includes('orders.edit') && p.stage !== 'DO_NOT_CONTACT'}
          />
        )}

        <Card>
          <h3 className="mb-3 font-semibold">{t.prospects.contacts}</h3>
          <ul className="grid gap-2">
            {p.contacts.map((c) => (
              <ContactRow
                key={c.id}
                c={c}
                canEdit={canEdit && p.stage !== 'DO_NOT_CONTACT'}
                onVerify={() => act(() => api(`/contacts/${c.id}/verify`, { method: 'POST' }))}
              />
            ))}
            {p.contacts.length === 0 && <li className="text-sm text-mist">—</li>}
          </ul>
          {canEdit && (
            <form onSubmit={addContact} className="mt-3 flex flex-wrap gap-2">
              <select
                name="kind"
                aria-label={t.prospects.addContact}
                className="min-h-10 rounded-xl border border-line bg-ink px-2 text-sm"
              >
                <option value="PHONE">{t.prospects.phone}</option>
                <option value="TELEGRAM">{t.prospects.telegram}</option>
              </select>
              <input
                name="value"
                required
                aria-label={t.prospects.addContact}
                className="min-h-10 min-w-40 flex-1 rounded-xl border border-line bg-ink px-3 text-sm"
              />
              <button
                type="submit"
                className="min-h-10 rounded-xl border border-line px-3 text-sm hover:border-gold/50"
              >
                {t.prospects.addContact}
              </button>
            </form>
          )}
        </Card>

        <Card>
          <h3 className="mb-2 font-semibold">{t.prospects.notes}</h3>
          <form onSubmit={saveNotes} className="grid gap-2">
            <textarea
              name="notes"
              defaultValue={p.notes ?? ''}
              rows={4}
              readOnly={!canEdit}
              aria-label={t.prospects.notes}
              className="rounded-xl border border-line bg-ink p-3 text-sm"
            />
            {canEdit && (
              <Button variant="ghost" type="submit">
                {t.prospects.saveNotes}
              </Button>
            )}
          </form>
        </Card>
      </div>

      <div className="grid content-start gap-4">
        <Card>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-semibold">{t.prospects.whyScore}</h3>
            <span className="text-2xl font-semibold tabular-nums">{p.score ?? '—'}</span>
          </div>
          {p.scoreReasons ? (
            <ul className="grid gap-1 text-sm">
              {p.scoreReasons.map((r) => (
                <li key={r.text} className="flex justify-between gap-2">
                  <span className="text-mist">{r.text}</span>
                  <span
                    className={`tabular-nums ${r.points > 0 ? 'text-ok' : r.points < 0 ? 'text-bad' : 'text-mist'}`}
                  >
                    {r.points > 0 ? `+${r.points}` : r.points}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-mist">{t.prospects.noScore}</p>
          )}
          {canEdit && (
            <Button
              variant="ghost"
              className="mt-3"
              onClick={() => act(() => api(`/prospects/${p.id}/score`, { method: 'POST' }))}
            >
              {t.prospects.rescore}
            </Button>
          )}
        </Card>
        <Card>
          <h3 className="mb-2 font-semibold">{t.prospects.sources}</h3>
          <ul className="grid gap-1 text-sm">
            {p.sources.map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span>
                  {s.sourceUrl ? (
                    <a
                      href={s.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-gold underline-offset-4 hover:underline"
                    >
                      {t.prospects.source[s.sourceType]}
                    </a>
                  ) : (
                    t.prospects.source[s.sourceType]
                  )}
                </span>
                <span className="text-xs text-mist">
                  {t.prospects.observed} {when(s.observedAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="mb-2 font-semibold">{t.prospects.history}</h3>
          <ul className="grid gap-1 text-xs text-mist">
            {p.history.map((h) => (
              <li key={h.id}>
                {when(h.createdAt)} · {t.prospects.action[h.action] ?? h.action}
                {h.details && 'to' in h.details ? ` → ${t.prospects.stage[String(h.details.to)] ?? ''}` : ''}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/** Inline confirmation (native prompt() is unreliable in installed iOS PWAs). */
function DncButton({ onConfirm }: { onConfirm: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-10 rounded-xl border border-bad/50 px-3 text-sm text-bad hover:bg-panel"
      >
        {t.prospects.dnc}
      </button>
    );
  }
  return (
    <form
      className="grid w-full gap-2 rounded-xl border border-bad/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(String(new FormData(e.currentTarget).get('reason') ?? ''));
        setOpen(false);
      }}
    >
      <p className="text-sm">{t.prospects.dncConfirm}</p>
      <input
        name="reason"
        placeholder={t.prospects.reasonPrompt}
        aria-label={t.prospects.reasonPrompt}
        className="min-h-10 rounded-xl border border-line bg-ink px-3 text-sm"
      />
      <div className="flex gap-2">
        <button type="submit" className="min-h-10 rounded-xl bg-bad px-3 text-sm font-medium text-ink">
          {t.prospects.dncYes}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-10 rounded-xl border border-line px-3 text-sm"
        >
          {t.prospects.cancel}
        </button>
      </div>
    </form>
  );
}

function ContactRow({ c, canEdit, onVerify }: { c: ProspectContact; canEdit: boolean; onVerify: () => void }) {
  const label = c.kind === 'PHONE' ? phone(c.value) : c.kind === 'TELEGRAM' ? `@${c.value}` : c.value;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2">
      <span className="tabular-nums">
        {label}{' '}
        <span className={`text-xs ${c.isVerified ? 'text-ok' : 'text-warn'}`}>
          ({c.isVerified ? t.prospects.verified : t.prospects.unverified})
        </span>
      </span>
      {canEdit && !c.isVerified && (
        <button
          type="button"
          onClick={onVerify}
          className="rounded-full border border-gold/50 px-2 py-0.5 text-xs text-gold hover:bg-panel"
        >
          {t.prospects.verify}
        </button>
      )}
    </li>
  );
}

function ProspectOrders({ prospectId, canCreate }: { prospectId: string; canCreate: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ orders: OrderRow[] }>(`/orders?prospectId=${prospectId}`)
      .then((r) => setRows(r.orders))
      .catch((e: Error) => setError(e.message));
  }, [prospectId]);
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      // An open draft for this prospect is returned instead of a duplicate.
      const o = await api<{ id: string }>('/orders', { method: 'POST', body: { prospectId, items: [] } });
      router.push(`/orders/view/?id=${o.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Card>
      <h3 className="mb-3 font-semibold">{t.orders.forProspect}</h3>
      {error && <Alert kind="error">{error}</Alert>}
      <ul className="grid gap-2 text-sm">
        {rows?.map((o) => (
          <li key={o.id}>
            <Link href={`/orders/view/?id=${o.id}`} className="flex items-center justify-between gap-2 hover:text-gold">
              <span>
                {o.number} · {som(o.totalSom)}
              </span>
              <Pill tone={ORDER_TONE[o.status] ?? 'muted'}>{t.orders.status[o.status]}</Pill>
            </Link>
          </li>
        ))}
        {rows?.length === 0 && <li className="text-mist">{t.orders.none}</li>}
      </ul>
      {canCreate && (
        <Button className="mt-3" onClick={create} disabled={busy}>
          {t.orders.create}
        </Button>
      )}
    </Card>
  );
}
