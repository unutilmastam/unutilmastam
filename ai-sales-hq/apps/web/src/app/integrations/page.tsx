'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell, Card, Pill } from '@/components/shell';
import { Alert, Button } from '@/components/ui';
import { api } from '@/lib/api';
import { som, when } from '@/lib/format';
import { t } from '@/lib/strings';

interface Run {
  id: string;
  status: string;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  createdCount: number;
  updatedCount: number;
  priceChangeCount: number;
  deactivatedCount: number;
  invalidCount: number;
  heldReason: string | null;
  errorMessage: string | null;
  report: {
    priceChanges?: { externalId: string; from: number; to: number }[];
    deactivated?: { name: string }[];
  } | null;
}
interface Status {
  status: 'NOT_CONFIGURED' | 'CONFIGURED' | 'CONNECTED' | 'ERROR';
  lastCheckedAt: string | null;
  lastError: string | null;
  lastSuccessfulSyncAt: string | null;
  settings: { syncEnabled: boolean; intervalMinutes: number };
  runs: Run[];
}

const TONE = { NOT_CONFIGURED: 'muted', CONFIGURED: 'warn', CONNECTED: 'ok', ERROR: 'bad' } as const;

export default function IntegrationsPage() {
  return <AppShell title={t.integrations.title}>{() => <Integrations />}</AppShell>;
}

function Integrations() {
  const [s, setS] = useState<Status | null>(null);
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<Status>('/integrations/firestore').then(setS), []);
  useEffect(() => {
    load().catch((e: Error) => setMsg({ kind: 'error', text: e.message }));
  }, [load]);

  const run = async (fn: () => Promise<string | undefined>) => {
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ kind: 'ok', text });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
      await load().catch(() => undefined);
    }
  };

  const saveSettings = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => {
      await api('/integrations/firestore/settings', {
        method: 'POST',
        body: { syncEnabled: f.get('syncEnabled') === 'on', intervalMinutes: Number(f.get('intervalMinutes')) },
      });
      return t.integrations.saved;
    });
  };

  if (!s) return msg ? <Alert kind="error">{msg.text}</Alert> : null;
  const held = s.runs[0]?.status === 'HELD' ? s.runs[0] : null;

  return (
    <div className="grid gap-4">
      <p className="text-sm text-mist">{t.integrations.intro}</p>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Firestore · unutilmastam-27858</h2>
          <Pill tone={TONE[s.status]}>{t.integrations.status[s.status]}</Pill>
        </div>
        {s.status === 'NOT_CONFIGURED' && <Alert kind="info">{t.integrations.notConfiguredHelp}</Alert>}
        <dl className="mb-4 grid gap-1 text-sm">
          <Row k={t.integrations.lastSuccess} v={when(s.lastSuccessfulSyncAt, t.integrations.never)} />
          <Row k={t.integrations.lastChecked} v={when(s.lastCheckedAt, t.integrations.never)} />
          {s.lastError && <Row k={t.integrations.lastError} v={s.lastError} bad />}
        </dl>
        {s.status !== 'NOT_CONFIGURED' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await api<{ ok: boolean; productCount?: number; invalidCount?: number; error?: string }>(
                    '/integrations/firestore/test',
                    { method: 'POST' },
                  );
                  if (!r.ok) throw new Error(r.error);
                  return t.integrations.testOk(r.productCount ?? 0, r.invalidCount ?? 0);
                })
              }
            >
              {t.integrations.test}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await api<Run>('/integrations/firestore/sync', { method: 'POST' });
                  if (r.status === 'FAILED') throw new Error(r.errorMessage ?? '');
                  return `${t.integrations.runStatus[r.status]}: ${t.integrations.counts(r)}`;
                })
              }
            >
              {t.integrations.syncNow}
            </Button>
          </div>
        )}
      </Card>

      {held && (
        <Card className="border-warn/50">
          <h2 className="mb-2 font-semibold text-warn">{t.integrations.runStatus.HELD}</h2>
          <p className="mb-3 text-sm">{held.heldReason}</p>
          {!!held.report?.priceChanges?.length && (
            <>
              <h3 className="mb-1 text-sm text-mist">{t.integrations.heldChanges}</h3>
              <ul className="mb-3 text-sm tabular-nums">
                {held.report.priceChanges.map((c) => (
                  <li key={c.externalId}>
                    {c.externalId}: {som(c.from)} → <b>{som(c.to)}</b>
                  </li>
                ))}
              </ul>
            </>
          )}
          {!!held.report?.deactivated?.length && (
            <>
              <h3 className="mb-1 text-sm text-mist">{t.integrations.removed}</h3>
              <ul className="mb-3 text-sm">
                {held.report.deactivated.map((d) => (
                  <li key={d.name}>{d.name}</li>
                ))}
              </ul>
            </>
          )}
          <Button
            disabled={busy}
            onClick={() =>
              window.confirm(t.integrations.applyConfirm) &&
              run(async () => {
                await api(`/integrations/firestore/runs/${held.id}/apply`, { method: 'POST' });
                return undefined;
              })
            }
          >
            {t.integrations.apply}
          </Button>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 font-semibold">{t.integrations.settings}</h2>
        <form onSubmit={saveSettings} className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="syncEnabled" defaultChecked={s.settings.syncEnabled} className="size-4" />
            {t.integrations.enabled}
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-mist">{t.integrations.interval}</span>
            <input
              type="number"
              name="intervalMinutes"
              min={5}
              max={1440}
              defaultValue={s.settings.intervalMinutes}
              className="w-28 rounded-xl border border-line bg-ink px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl border border-line px-4 py-2 text-sm hover:border-gold/50"
          >
            {t.integrations.save}
          </button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">{t.integrations.runs}</h2>
        <ul className="grid gap-2 text-sm">
          {s.runs.map((r) => (
            <li key={r.id} className="border-t border-line pt-2 first:border-0 first:pt-0">
              <div className="flex justify-between gap-2">
                <span>{when(r.startedAt)}</span>
                <span className={r.status === 'FAILED' ? 'text-bad' : r.status === 'HELD' ? 'text-warn' : 'text-mist'}>
                  {t.integrations.runStatus[r.status]}
                </span>
              </div>
              <div className="text-xs text-mist">{r.errorMessage ?? t.integrations.counts(r)}</div>
            </li>
          ))}
          {s.runs.length === 0 && <li className="text-mist">{t.integrations.never}</li>}
        </ul>
      </Card>
    </div>
  );
}

function Row({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3">
      <dt className="text-mist">{k}</dt>
      <dd className={bad ? 'text-bad' : ''}>{v}</dd>
    </div>
  );
}
