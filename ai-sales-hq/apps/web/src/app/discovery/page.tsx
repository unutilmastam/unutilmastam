'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell, Card, Pill } from '@/components/shell';
import { Alert, Button } from '@/components/ui';
import { api, type Me } from '@/lib/api';
import { t } from '@/lib/strings';

interface Settings {
  placesDailyLimit: number;
  queries: string[];
  districts: string[];
  matchByNameAndDistrict: boolean;
  qualifyThreshold: number;
}
interface Status {
  settings: Settings;
  firestore: { configured: boolean; status: string };
  places: { configured: boolean; status: string; lastError: string | null; usedToday: number; dailyLimit: number };
  sources: Record<string, number>;
  stages: Record<string, number>;
  districts: string[];
}

const TONE: Record<string, 'ok' | 'warn' | 'bad' | 'muted'> = {
  NOT_CONFIGURED: 'muted',
  CONFIGURED: 'warn',
  CONNECTED: 'ok',
  ERROR: 'bad',
};

export default function DiscoveryPage() {
  return <AppShell title={t.discovery.title}>{(me) => <Discovery me={me} />}</AppShell>;
}

function Discovery({ me }: { me: Me }) {
  const [s, setS] = useState<Status | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = me.permissions.includes('settings.manage');

  const load = useCallback(() => api<Status>('/discovery').then(setS), []);
  useEffect(() => {
    load().catch((e: Error) => setMsg({ kind: 'error', text: e.message }));
  }, [load]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ kind: 'ok', text: await fn() });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
      await load().catch(() => undefined);
    }
  };

  if (!s) return msg ? <Alert kind="error">{msg.text}</Alert> : null;

  const search = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () =>
      t.discovery.found(
        await api('/discovery/places-search', {
          method: 'POST',
          body: { query: f.get('query'), district: f.get('district') },
        }),
      ),
    );
  };
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => {
      await api('/discovery/settings', {
        method: 'POST',
        body: {
          placesDailyLimit: Number(f.get('limit')),
          queries: String(f.get('queries') ?? '')
            .split('\n')
            .map((q) => q.trim())
            .filter(Boolean),
          districts: f.getAll('district'),
          matchByNameAndDistrict: f.get('nameMatch') === 'on',
          qualifyThreshold: Number(f.get('threshold')),
        },
      });
      return t.discovery.saved;
    });
  };

  const input = 'rounded-xl border border-line bg-ink px-3 py-2 text-sm';
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <p className="text-sm text-mist lg:col-span-2">{t.discovery.intro}</p>
      {msg && (
        <div className="lg:col-span-2">
          <Alert kind={msg.kind}>{msg.text}</Alert>
        </div>
      )}
      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-semibold">{t.discovery.firestore}</h2>
          <Pill tone={TONE[s.firestore.status] ?? 'muted'}>{t.integrations.status[s.firestore.status]}</Pill>
        </div>
        {s.firestore.configured && canManage ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              run(async () => t.discovery.imported(await api('/discovery/firestore-import', { method: 'POST' })))
            }
          >
            {t.discovery.firestoreRun}
          </Button>
        ) : (
          !s.firestore.configured && <p className="text-sm text-mist">{t.integrations.notConfiguredHelp}</p>
        )}
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-semibold">{t.discovery.places}</h2>
          <Pill tone={TONE[s.places.status] ?? 'muted'}>{t.integrations.status[s.places.status]}</Pill>
        </div>
        {!s.places.configured ? (
          <p className="text-sm text-mist">{t.discovery.placesHelp}</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-mist">{t.discovery.usage(s.places.usedToday, s.places.dailyLimit)}</p>
            {s.places.lastError && <Alert kind="error">{s.places.lastError}</Alert>}
            {canManage && (
              <form onSubmit={search} className="flex flex-wrap gap-2">
                <input
                  name="query"
                  required
                  minLength={2}
                  defaultValue={s.settings.queries[0]}
                  aria-label={t.discovery.query}
                  className={`${input} min-w-0 flex-1`}
                />
                <select name="district" aria-label={t.discovery.district} className={input}>
                  {s.districts.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-gold px-4 py-2 text-sm font-medium text-ink disabled:opacity-60"
                >
                  {t.discovery.searchNow}
                </button>
              </form>
            )}
          </>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">{t.discovery.stats}</h2>
        <ul className="grid gap-1 text-sm">
          {Object.entries(s.stages).map(([k, v]) => (
            <li key={k} className="flex justify-between">
              <span className="text-mist">{t.prospects.stage[k]}</span>
              <span className="tabular-nums">{v}</span>
            </li>
          ))}
          {Object.entries(s.sources).map(([k, v]) => (
            <li key={k} className="flex justify-between">
              <span className="text-mist">{t.prospects.source[k]}</span>
              <span className="tabular-nums">{v}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-mist">{t.discovery.agentHint}</p>
      </Card>

      {canManage && (
        <Card>
          <h2 className="mb-3 font-semibold">{t.discovery.settings}</h2>
          <form onSubmit={save} className="grid gap-3 text-sm">
            <label>
              <span className="mb-1 block text-mist">{t.discovery.dailyLimit}</span>
              <input
                type="number"
                name="limit"
                min={0}
                max={1000}
                defaultValue={s.settings.placesDailyLimit}
                className={`${input} w-28`}
              />
            </label>
            <label>
              <span className="mb-1 block text-mist">{t.discovery.queries}</span>
              <textarea
                name="queries"
                rows={4}
                defaultValue={s.settings.queries.join('\n')}
                className={`${input} w-full`}
              />
            </label>
            <fieldset className="flex flex-wrap gap-1">
              <legend className="mb-1 text-mist">{t.discovery.districts}</legend>
              {s.districts.map((d) => (
                <label key={d} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs">
                  <input type="checkbox" name="district" value={d} defaultChecked={s.settings.districts.includes(d)} />
                  {d}
                </label>
              ))}
            </fieldset>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="nameMatch" defaultChecked={s.settings.matchByNameAndDistrict} />
              {t.discovery.nameMatch}
            </label>
            <label>
              <span className="mb-1 block text-mist">{t.discovery.threshold}</span>
              <input
                type="number"
                name="threshold"
                min={0}
                max={100}
                defaultValue={s.settings.qualifyThreshold}
                className={`${input} w-28`}
              />
            </label>
            <Button type="submit" variant="ghost" disabled={busy}>
              {t.discovery.save}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
