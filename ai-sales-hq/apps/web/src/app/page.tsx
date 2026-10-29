'use client';

import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { Office, type OfficeAgent } from '@/components/office';
import { AppShell, Card, CardHeader, Pill } from '@/components/shell';
import { Alert } from '@/components/ui';
import { api, type Me } from '@/lib/api';
import { som, somShort, todayUz, when } from '@/lib/format';
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
    conversationsNeedOwner: number;
    unreadNotifications: number;
  };
  integrations: { website: IntegrationStatus; telegram: IntegrationStatus; ai: IntegrationStatus };
  lastSuccessfulSyncAt: string | null;
  conversations: { active: number; needsOwner: number };
  prospects: { newToday: number; qualified: number; needsReview: number; total: number };
  orders: {
    awaitingReview: number;
    draftValue: number;
    approvedValue: number;
    deliveredValue: number;
    paidSom: number;
  };
}

const TONE = { NOT_CONFIGURED: 'muted', CONFIGURED: 'warn', CONNECTED: 'ok', ERROR: 'bad' } as const;

export default function DashboardPage() {
  return (
    <AppShell title={t.dashboard.title} subtitle={(me) => <Greeting name={me.user.displayName} />}>
      {(me) => <Dashboard me={me} />}
    </AppShell>
  );
}

function Greeting({ name }: { name: string }) {
  const [date, setDate] = useState('');
  useEffect(() => setDate(todayUz()), []);
  return (
    <span>
      {t.home.greeting(name)}
      {date && <span className="text-faint"> · {date}</span>}
    </span>
  );
}

function Dashboard({ me }: { me: Me }) {
  const canSeeAgents = me.permissions.includes('agents.view');
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
  if (!summary) return <DashboardSkeleton />;
  const a = summary.attention;
  const attention = [
    a.heldSync && { text: t.dashboard.held, href: '/integrations/', tone: 'warn' as const },
    a.conversationsNeedOwner > 0 && {
      text: t.dashboard.needOwner(a.conversationsNeedOwner),
      href: '/outreach/',
      tone: 'warn' as const,
    },
    a.agentErrors > 0 && { text: t.dashboard.agentErrors(a.agentErrors), href: '/agents/', tone: 'bad' as const },
    a.failedJobsToday > 0 && {
      text: t.dashboard.failedJobs(a.failedJobsToday),
      href: '/agents/',
      tone: 'bad' as const,
    },
    summary.orders.awaitingReview > 0 && {
      text: `${t.dashboard.ordersReview}: ${summary.orders.awaitingReview}`,
      href: '/orders/',
      tone: 'gold' as const,
    },
    a.unconfirmedPrices > 0 && {
      text: t.dashboard.unconfirmed(a.unconfirmedPrices),
      href: '/catalog/',
      tone: 'warn' as const,
    },
    a.unreadNotifications > 0 && {
      text: t.dashboard.unread(a.unreadNotifications),
      href: '/notifications/',
      tone: 'muted' as const,
    },
  ].filter(Boolean) as { text: string; href: string; tone: 'warn' | 'bad' | 'gold' | 'muted' }[];
  const totalAgents =
    summary.agents.running +
    summary.agents.waiting +
    summary.agents.paused +
    summary.agents.stopped +
    summary.agents.disabled +
    summary.agents.error;
  const funnel = [
    { label: t.dashboard.funnelTotal, value: summary.prospects.total, href: '/prospects/' },
    { label: t.dashboard.funnelReview, value: summary.prospects.needsReview, href: '/prospects/' },
    { label: t.dashboard.funnelQualified, value: summary.prospects.qualified, href: '/prospects/' },
    { label: t.dashboard.funnelTalks, value: summary.conversations.active, href: '/outreach/' },
    { label: t.dashboard.funnelOrders, value: summary.orders.awaitingReview, href: '/orders/' },
  ];
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

  return (
    <div className="grid gap-6">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Kpi
          icon="agents"
          label={t.dashboard.kpiAgents}
          value={
            <>
              {summary.agents.running}
              <span className="text-faint"> / {totalAgents}</span>
            </>
          }
          hint={t.dashboard.kpiAgentsHint(summary.agents.paused, summary.agents.error)}
          tone={summary.agents.error ? 'bad' : summary.agents.running ? 'ok' : undefined}
          href="/agents/"
        />
        <Kpi
          icon="store"
          label={t.dashboard.kpiProspects}
          value={summary.prospects.newToday}
          hint={t.dashboard.kpiProspectsHint(summary.prospects.total, summary.prospects.qualified)}
          href="/prospects/"
        />
        <Kpi
          icon="box"
          label={t.dashboard.kpiOrders}
          value={summary.orders.awaitingReview}
          hint={t.dashboard.kpiOrdersHint(somShort(summary.orders.draftValue))}
          tone={summary.orders.awaitingReview ? 'gold' : undefined}
          href="/orders/"
        />
        <Kpi
          icon="coin"
          label={t.dashboard.kpiSales}
          value={<MoneyValue amount={summary.orders.deliveredValue} />}
          hint={t.dashboard.kpiSalesHint(somShort(summary.orders.paidSom))}
          href="/orders/"
        />
      </dl>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:grid-rows-[auto_1fr]">
        <section className="min-w-0 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          {office && (
            <>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-[17px] font-semibold tracking-[-0.015em]">{t.dashboard.office}</h2>
                  <p className="mt-0.5 text-[13px] text-mist">{t.dashboard.officeHint}</p>
                </div>
              </div>
              <Office agents={office} workerHealthy={worker} />
            </>
          )}
        </section>

        <Card className="order-first p-0 xl:order-none xl:col-start-2 xl:row-start-1">
          <div className="px-5 pt-5">
            <CardHeader
              title={t.dashboard.attention}
              hint={attention.length ? t.dashboard.systemWarn : t.dashboard.systemOk}
            />
          </div>
          {attention.length === 0 ? (
            <div className="flex items-center gap-3 px-5 pb-5 text-sm text-mist">
              <span className="grid size-8 place-items-center rounded-full bg-ok/10 text-ok">
                <Icon name="check" size={16} />
              </span>
              {t.dashboard.allClear}
            </div>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {attention.map((item) => (
                <li key={item.text}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 px-5 py-3 text-[14px] transition-colors hover:bg-panel/70"
                  >
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                        item.tone === 'bad'
                          ? 'bg-bad/10 text-bad'
                          : item.tone === 'warn'
                            ? 'bg-warn/10 text-warn'
                            : item.tone === 'gold'
                              ? 'bg-gold/10 text-gold'
                              : 'bg-panel text-mist'
                      }`}
                    >
                      <Icon name={item.tone === 'muted' ? 'bell' : 'alert'} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">{item.text}</span>
                    <Icon name="chevron" size={16} className="text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <aside className="grid content-start gap-4 xl:col-start-2 xl:row-start-2">
          <Card>
            <CardHeader title={t.dashboard.funnel} hint={t.dashboard.funnelHint} />
            <ul className="grid gap-3">
              {funnel.map((f) => (
                <li key={f.label}>
                  <Link href={f.href} className="group block">
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="text-mist group-hover:text-paper">{f.label}</span>
                      <span className="font-semibold tabular-nums">{f.value}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-panel">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${f.value ? Math.max(4, (f.value / funnelMax) * 100) : 0}%`,
                          backgroundImage: 'var(--gold-gradient)',
                        }}
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title={t.dashboard.money} hint={t.dashboard.ordersNote} />
            <dl className="grid gap-2.5 text-[14px]">
              <Money label={t.dashboard.draftValue} value={summary.orders.draftValue} />
              <Money label={t.dashboard.approvedValue} value={summary.orders.approvedValue} />
              <Money label={t.dashboard.deliveredValue} value={summary.orders.deliveredValue} />
              <div className="border-t border-line pt-2.5">
                <Money label={t.dashboard.paid} value={summary.orders.paidSom} strong />
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title={t.dashboard.integrations} />
            <ul className="grid gap-3 text-[14px]">
              <IntegrationRow icon="globe" label={t.dashboard.website} status={summary.integrations.website} />
              <IntegrationRow icon="send" label={t.dashboard.telegramBot} status={summary.integrations.telegram} />
              <IntegrationRow icon="spark" label={t.dashboard.ai} status={summary.integrations.ai} />
            </ul>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-faint">
              <Icon name="clock" size={13} />
              {t.dashboard.lastSync}: {when(summary.lastSuccessfulSyncAt, t.integrations.never)}
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone,
  href,
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  hint: string;
  tone?: 'ok' | 'bad' | 'gold';
  href: string;
}) {
  const accent =
    tone === 'ok'
      ? 'text-ok bg-ok/10'
      : tone === 'bad'
        ? 'text-bad bg-bad/10'
        : tone === 'gold'
          ? 'text-gold bg-gold/10'
          : 'text-mist bg-panel';
  return (
    <Link
      href={href}
      className="surface group relative block overflow-hidden rounded-2xl border border-line p-4 transition-colors hover:border-line-strong sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <dt className="text-[12.5px] font-medium text-mist">{label}</dt>
        <span className={`grid size-8 place-items-center rounded-lg ${accent}`}>
          <Icon name={icon} size={16} />
        </span>
      </div>
      <dd className="mt-3 text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums sm:text-[30px]">
        {value}
      </dd>
      <p className="mt-2 truncate text-[12.5px] text-faint">{hint}</p>
    </Link>
  );
}

function MoneyValue({ amount }: { amount: number }) {
  const [num, unit] = somShort(amount).split(/ (?=(?:ming |mln |mlrd )?so'm$)/);
  return (
    <>
      {num}
      <span className="ml-1 text-[14px] font-medium tracking-normal text-faint">{unit}</span>
    </>
  );
}

function Money({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={strong ? 'font-medium' : 'text-mist'}>{label}</dt>
      <dd className={`whitespace-nowrap tabular-nums ${strong ? 'font-semibold text-gold' : 'font-medium'}`}>
        {som(value)}
      </dd>
    </div>
  );
}

function IntegrationRow({ icon, label, status }: { icon: IconName; label: string; status: IntegrationStatus }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2.5">
        <span className="grid size-7 place-items-center rounded-lg border border-line bg-panel text-mist">
          <Icon name={icon} size={14} />
        </span>
        {label}
      </span>
      <Pill tone={TONE[status]}>{t.integrations.status[status]}</Pill>
    </li>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-[118px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="skeleton h-[420px] rounded-2xl" />
        <div className="skeleton h-[420px] rounded-2xl" />
      </div>
    </div>
  );
}
