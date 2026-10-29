'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { DraftCard, type DraftMessage } from '@/components/draft';
import { AppShell, Card } from '@/components/shell';
import { Alert, Button } from '@/components/ui';
import { api, type Me } from '@/lib/api';
import { when } from '@/lib/format';
import type { ProspectContact } from '@/lib/prospects';
import { t } from '@/lib/strings';

interface ProspectCard {
  id: string;
  name: string;
  stage: string;
  district: string | null;
  contacts: ProspectContact[];
}
interface Desk {
  drafts: { message: DraftMessage; prospect: ProspectCard | null }[];
  followUps: { followUpAt: string; prospect: ProspectCard | null }[];
  needsOwner: { why: string | null; prospect: ProspectCard | null }[];
  ai: { configured: boolean; enabled: boolean; spentTodayUsd: number; budgetUsd: number };
  settings: {
    cooldownDays: number;
    dailyDraftLimit: number;
    signature: string;
    language: 'uz' | 'ru';
    aiEnabled: boolean;
    aiDailyBudgetUsd: number;
  };
}

export default function OutreachPage() {
  return <AppShell title={t.outreach.title}>{(me) => <Outreach me={me} />}</AppShell>;
}

function Outreach({ me }: { me: Me }) {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const load = useCallback(() => api<Desk>('/outreach').then(setDesk), []);
  useEffect(() => {
    load().catch((e: Error) => setMsg({ kind: 'error', text: e.message }));
  }, [load]);

  if (!desk) return msg ? <Alert kind="error">{msg.text}</Alert> : null;
  const refresh = () => void load().catch(() => undefined);

  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    api('/sales/settings', {
      method: 'POST',
      body: {
        cooldownDays: Number(f.get('cooldown')),
        dailyDraftLimit: Number(f.get('limit')),
        signature: String(f.get('signature')),
        language: f.get('language'),
        aiEnabled: f.get('aiEnabled') === 'on',
        aiDailyBudgetUsd: Number(f.get('budget')),
      },
    })
      .then(() => setMsg({ kind: 'ok', text: t.outreach.saved }))
      .catch((err: Error) => setMsg({ kind: 'error', text: err.message }))
      .finally(refresh);
  };
  const input = 'rounded-xl border border-line bg-ink px-3 py-2 text-sm';

  return (
    <div className="grid gap-4">
      <p className="text-sm text-mist">{t.outreach.intro}</p>
      <p className="text-xs text-mist">
        {desk.ai.configured ? t.outreach.ai(desk.ai.spentTodayUsd, desk.ai.budgetUsd) : t.outreach.aiOff}
      </p>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {desk.needsOwner.length > 0 && (
        <Card className="border-warn/50">
          <h2 className="mb-2 font-semibold text-warn">{t.outreach.needsOwner}</h2>
          <ul className="grid gap-2">
            {desk.needsOwner.map(
              (n) =>
                n.prospect && (
                  <li key={n.prospect.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/prospects/view/?id=${n.prospect.id}`} className="text-gold">
                      {n.prospect.name}
                    </Link>
                    <span className="text-xs text-mist">{n.why}</span>
                  </li>
                ),
            )}
          </ul>
        </Card>
      )}

      <section>
        <h2 className="mb-2 text-sm uppercase tracking-[0.18em] text-gold">{t.outreach.drafts}</h2>
        {desk.drafts.length === 0 && <p className="text-sm text-mist">{t.outreach.empty}</p>}
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
          {desk.drafts.map(
            (d) =>
              d.prospect && (
                <li key={d.message.id} className="min-w-0">
                  <Card>
                    <DraftCard message={d.message} prospect={d.prospect} onChange={refresh} showProspect />
                  </Card>
                </li>
              ),
          )}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm uppercase tracking-[0.18em] text-gold">{t.outreach.followUps}</h2>
        {desk.followUps.length === 0 && <p className="text-sm text-mist">{t.outreach.empty}</p>}
        <ul className="grid gap-2">
          {desk.followUps.map(
            (f) =>
              f.prospect && (
                <li key={f.prospect.id}>
                  <Link
                    href={`/prospects/view/?id=${f.prospect.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-line bg-graphite px-4 py-3 hover:border-gold/50"
                  >
                    <span>{f.prospect.name}</span>
                    <span className="text-xs text-mist">{when(f.followUpAt)}</span>
                  </Link>
                </li>
              ),
          )}
        </ul>
      </section>

      {me.permissions.includes('settings.manage') && (
        <Card>
          <h2 className="mb-3 font-semibold">{t.outreach.settings}</h2>
          <form onSubmit={save} className="grid gap-3 text-sm sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-mist">{t.outreach.cooldown}</span>
              <input
                type="number"
                name="cooldown"
                min={1}
                max={90}
                defaultValue={desk.settings.cooldownDays}
                className={`${input} w-28`}
              />
            </label>
            <label>
              <span className="mb-1 block text-mist">{t.outreach.dailyLimit}</span>
              <input
                type="number"
                name="limit"
                min={0}
                max={500}
                defaultValue={desk.settings.dailyDraftLimit}
                className={`${input} w-28`}
              />
            </label>
            <label>
              <span className="mb-1 block text-mist">{t.outreach.signature}</span>
              <input name="signature" defaultValue={desk.settings.signature} className={`${input} w-full`} />
            </label>
            <label>
              <span className="mb-1 block text-mist">{t.outreach.language}</span>
              <select name="language" defaultValue={desk.settings.language} className={input}>
                <option value="uz">O‘zbekcha</option>
                <option value="ru">Русский</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="aiEnabled" defaultChecked={desk.settings.aiEnabled} />
              {t.outreach.aiEnabled}
            </label>
            <label>
              <span className="mb-1 block text-mist">{t.outreach.aiBudget}</span>
              <input
                type="number"
                name="budget"
                min={0}
                max={100}
                step={0.01}
                defaultValue={desk.settings.aiDailyBudgetUsd}
                className={`${input} w-28`}
              />
            </label>
            <Button type="submit" variant="ghost" className="sm:col-span-2">
              {t.outreach.save}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
