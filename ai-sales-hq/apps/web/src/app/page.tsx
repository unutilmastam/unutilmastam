'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import { Office, type OfficeAgent } from '@/components/office';
import { AppShell, Card, Pill } from '@/components/shell';
import { Alert } from '@/components/ui';
import { api } from '@/lib/api';
import { when } from '@/lib/format';
import { t } from '@/lib/strings';

type IntegrationStatus = 'NOT_CONFIGURED' | 'CONFIGURED' | 'CONNECTED' | 'ERROR';
interface Summary {
  agents: { running: number; waiting: number; paused: number; stopped: number; disabled: number; error: number };
  tasksInProgress: number;
  attention: {
    failedJobsToday: number;
    unconfirmedPrices: number;
    heldSync: boolean;
    agentErrors: number;
    unreadNotifications: number;
  };
  integrations: { website: IntegrationStatus; telegram: IntegrationStatus; ai: IntegrationStatus };
  lastSuccessfulSyncAt: string | null;
  prospects: { newToday: number; qualified: number; needsReview: number; total: number };
}

const TONE = { NOT_CONFIGURED: 'muted', CONFIGURED: 'warn', CONNECTED: 'ok', ERROR: 'bad' } as const;

export default function DashboardPage() {
  return (
    <AppShell title={t.dashboard.title}>
      {(me) => <Dashboard name={me.user.displayName} canSeeAgents={me.permissions.includes('agents.view')} />}
    </AppShell>
  );
}

function Dashboard({ name, canSeeAgents }: { name: string; canSeeAgents: boolean }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [office, setOffice] = useState<OfficeAgent[] | null>(null);
  const [worker, setWorker] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, o, c] = await Promise.all([
      api<Summary>('/dashboard'),
      canSeeAgents ? api<{ agents: OfficeAgent[] }>('/office') : Promise.resolve(null),
      canSeeAgents ? api<{ worker: { healthy: boolean } }>('/control/overview') : Promise.resolve(null),
    ]);
    setSummary(s);
    setOffice(o?.agents ?? null);
    setWorker(c ? c.worker.healthy : null);
  }, [canSeeAgents]);

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
    const timer = setInterval(() => void load().catch(() => undefined), 10_000);
    return () => clearInterval(timer);
  }, [load]);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!summary) return null;
  const a = summary.attention;
  const attention = [
    a.heldSync && { text: t.dashboard.held, href: '/integrations/', tone: 'warn' as const },
    a.agentErrors > 0 && { text: t.dashboard.agentErrors(a.agentErrors), href: '/agents/', tone: 'bad' as const },
    a.failedJobsToday > 0 && {
      text: t.dashboard.failedJobs(a.failedJobsToday),
      href: '/agents/',
      tone: 'bad' as const,
    },
    a.unconfirmedPrices > 0 && {
      text: t.dashboard.unconfirmed(a.unconfirmedPrices),
      href: '/catalog/',
      tone: 'warn' as const,
    },
    a.unreadNotifications > 0 && {
      text: t.dashboard.unread(a.unreadNotifications),
      href: '/notifications/',
      tone: 'gold' as const,
    },
  ].filter(Boolean) as { text: string; href: string; tone: 'warn' | 'bad' | 'gold' }[];

  return (
    <>
      <p className="-mt-3 mb-5 text-mist">{t.home.greeting(name)}</p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="order-2 min-w-0 lg:order-1">
          {office && (
            <>
              <div className="mb-3 flex items-end justify-between gap-2">
                <h2 className="text-sm uppercase tracking-[0.18em] text-gold">{t.dashboard.office}</h2>
                <p className="hidden text-xs text-mist sm:block">{t.dashboard.officeHint}</p>
              </div>
              <Office agents={office} workerHealthy={worker} />
            </>
          )}
        </section>

        <aside className="order-1 grid content-start gap-4 lg:order-2">
          <Card>
            <h2 className="mb-3 text-sm uppercase tracking-[0.18em] text-gold">{t.dashboard.attention}</h2>
            {attention.length === 0 ? (
              <p className="text-sm text-mist">{t.dashboard.allClear}</p>
            ) : (
              <ul className="grid gap-2">
                {attention.map((item) => (
                  <li key={item.text}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:border-gold/50"
                    >
                      <span
                        className={item.tone === 'bad' ? 'text-bad' : item.tone === 'warn' ? 'text-warn' : 'text-gold'}
                      >
                        <Icon name="alert" size={16} />
                      </span>
                      {item.text}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-sm uppercase tracking-[0.18em] text-gold">{t.dashboard.agentsTitle}</h2>
            <dl className="grid grid-cols-2 gap-3">
              <Stat label={t.dashboard.running} value={summary.agents.running} tone="ok" />
              <Stat label={t.dashboard.inProgress} value={summary.tasksInProgress} />
              <Stat
                label={t.dashboard.paused}
                value={summary.agents.paused}
                tone={summary.agents.paused ? 'warn' : undefined}
              />
              <Stat
                label={t.dashboard.errors}
                value={summary.agents.error}
                tone={summary.agents.error ? 'bad' : undefined}
              />
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm uppercase tracking-[0.18em] text-gold">{t.dashboard.integrations}</h2>
            <ul className="grid gap-2 text-sm">
              <IntegrationRow label={t.dashboard.website} status={summary.integrations.website} />
              <IntegrationRow label={t.dashboard.telegramBot} status={summary.integrations.telegram} />
              <IntegrationRow label={t.dashboard.ai} status={summary.integrations.ai} />
            </ul>
            <p className="mt-3 text-xs text-mist">
              {t.dashboard.lastSync}: {when(summary.lastSuccessfulSyncAt, t.integrations.never)}
            </p>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm uppercase tracking-[0.18em] text-gold">{t.dashboard.sales}</h2>
            {/* These modules arrive in later phases; no number is shown until real data exists. */}
            <ul className="grid gap-1 text-sm">
              <Count label={t.dashboard.prospectsTotal} value={summary.prospects.total} href="/prospects/" />
              <Count label={t.dashboard.prospectsNew} value={summary.prospects.newToday} href="/prospects/" />
              <Count label={t.dashboard.qualified} value={summary.prospects.qualified} href="/prospects/" />
              <Count label={t.dashboard.needsReview} value={summary.prospects.needsReview} href="/prospects/" />
              <Later label={t.dashboard.conversations} phase={6} />
              <Later label={t.dashboard.ordersReview} phase={7} />
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-paper';
  return (
    <div className="rounded-xl border border-line px-3 py-2">
      <dt className="text-xs text-mist">{label}</dt>
      <dd className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}

function IntegrationRow({ label, status }: { label: string; status: IntegrationStatus }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <Pill tone={TONE[status]}>{t.integrations.status[status]}</Pill>
    </li>
  );
}

function Count({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-2 hover:text-gold">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </Link>
    </li>
  );
}

function Later({ label, phase }: { label: string; phase: number }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-mist">{label}</span>
      <span className="text-xs text-mist">{t.dashboard.later(phase)}</span>
    </li>
  );
}
