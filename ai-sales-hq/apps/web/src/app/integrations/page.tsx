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
  return (
    <AppShell title={t.integrations.title} subtitle={t.integrations.intro}>
      {() => <Integrations />}
    </AppShell>
  );
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

      <AiCard />

      <TelegramCard />

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
              className="input w-28"
            />
          </label>
          <button type="submit" disabled={busy} className="btn btn-secondary px-4">
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

interface TgStatus {
  status: 'NOT_CONFIGURED' | 'CONFIGURED' | 'CONNECTED' | 'ERROR';
  lastSuccessAt: string | null;
  lastError: string | null;
  webhookReady: boolean;
}

function TelegramCard() {
  const [s, setS] = useState<TgStatus | null>(null);
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const load = useCallback(() => api<TgStatus>('/integrations/telegram').then(setS), []);
  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);
  const run = async (fn: () => Promise<string>) => {
    setMsg(null);
    try {
      setMsg({ kind: 'ok', text: await fn() });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    }
    await load().catch(() => undefined);
  };
  if (!s) return null;
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">{t.telegram.title}</h2>
        <Pill tone={TONE[s.status]}>{t.integrations.status[s.status]}</Pill>
      </div>
      <p className="mb-3 text-sm text-mist">{t.telegram.intro}</p>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {s.status === 'NOT_CONFIGURED' ? (
        <Alert kind="info">{t.telegram.notConfigured}</Alert>
      ) : (
        <>
          <dl className="mb-3 grid gap-1 text-sm">
            <Row k={t.integrations.lastSuccess} v={when(s.lastSuccessAt, t.integrations.never)} />
            {s.lastError && <Row k={t.integrations.lastError} v={s.lastError} bad />}
          </dl>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="ghost"
              onClick={() =>
                run(async () =>
                  t.telegram.testOk(
                    (await api<{ bot: string }>('/integrations/telegram/test', { method: 'POST' })).bot,
                  ),
                )
              }
            >
              {t.telegram.test}
            </Button>
            {s.webhookReady && (
              <Button
                variant="ghost"
                onClick={() =>
                  run(async () => {
                    await api('/integrations/telegram/webhook', { method: 'POST' });
                    return t.telegram.webhookOk;
                  })
                }
              >
                {t.telegram.webhook}
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

interface AiStatus {
  status: 'NOT_CONFIGURED' | 'CONFIGURED' | 'CONNECTED' | 'ERROR';
  source: 'app' | 'env' | 'none' | 'unreadable';
  keyLast4: string | null;
  savedAt: string | null;
  model: string;
  strongModel: string;
  models: string[];
  lastSuccessAt: string | null;
  lastError: string | null;
  spentTodayUsd: number;
  budgetUsd: number;
}

function AiCard() {
  const [s, setS] = useState<AiStatus | null>(null);
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const load = useCallback(() => api<AiStatus>('/integrations/ai').then(setS), []);
  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);
  const run = async (fn: () => Promise<string>) => {
    setMsg(null);
    setBusy(true);
    try {
      setMsg({ kind: 'ok', text: await fn() });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
    await load().catch(() => undefined);
  };
  if (!s) return null;
  const hasKey = s.source === 'app' || s.source === 'env';
  const showForm = !hasKey || editing;

  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const apiKey = String(f.get('apiKey') ?? '').trim();
    void run(async () => {
      await api('/integrations/ai/key', {
        method: 'POST',
        body: {
          ...(apiKey ? { apiKey } : {}),
          model: f.get('model'),
          strongModel: f.get('strongModel'),
        },
      });
      form.reset();
      setEditing(false);
      return t.aiProvider.saved;
    });
  };

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">{t.aiProvider.title}</h2>
        <Pill tone={TONE[s.status]}>{t.integrations.status[s.status]}</Pill>
      </div>
      <p className="mb-3 text-sm text-mist">{t.aiProvider.intro}</p>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {s.source === 'none' && <Alert kind="info">{t.aiProvider.notConfigured}</Alert>}
      {s.source === 'unreadable' && <Alert kind="error">{t.aiProvider.unreadable}</Alert>}
      {hasKey && (
        <dl className="mb-3 grid gap-1 text-sm">
          <Row k={t.aiProvider.key} v={t.aiProvider.keyValue(s.keyLast4 ?? '????', s.source === 'env')} />
          <Row k={t.aiProvider.models(s.model, s.strongModel)} v="" />
          <Row k={t.integrations.lastSuccess} v={when(s.lastSuccessAt, t.integrations.never)} />
          <Row k={t.outreach.ai(s.spentTodayUsd, s.budgetUsd)} v="" />
          {s.lastError && <Row k={t.integrations.lastError} v={s.lastError} bad />}
        </dl>
      )}
      {showForm ? (
        <form onSubmit={save} className="grid gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-mist">{t.aiProvider.keyLabel}</span>
            <input
              type="password"
              name="apiKey"
              autoComplete="off"
              spellCheck={false}
              required={s.source !== 'app'}
              placeholder={s.source === 'app' ? t.aiProvider.keepKey : 'sk-ant-...'}
              className="input w-full font-mono"
            />
            <span className="mt-1 block text-xs text-mist">{t.aiProvider.keyHint}</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-mist">{t.aiProvider.model}</span>
              <select name="model" defaultValue={s.model} className="input w-full">
                {s.models.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-mist">{t.aiProvider.strongModel}</span>
              <select name="strongModel" defaultValue={s.strongModel} className="input w-full">
                {s.models.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="submit" disabled={busy}>
              {busy ? t.aiProvider.checking : t.aiProvider.save}
            </Button>
            {editing && (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                {t.aiProvider.cancel}
              </Button>
            )}
          </div>
        </form>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api('/integrations/ai/test', { method: 'POST' });
                return t.aiProvider.ok;
              })
            }
          >
            {t.aiProvider.test}
          </Button>
          <Button variant="ghost" onClick={() => setEditing(true)}>
            {t.aiProvider.change}
          </Button>
          {s.source === 'app' &&
            (confirmRemove ? (
              <Button
                variant="ghost"
                className="text-bad"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api('/integrations/ai/key/remove', { method: 'POST' });
                    setConfirmRemove(false);
                    return t.aiProvider.removed;
                  })
                }
              >
                {t.aiProvider.removeConfirm}
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmRemove(true)}>
                {t.aiProvider.remove}
              </Button>
            ))}
        </div>
      )}
    </Card>
  );
}
