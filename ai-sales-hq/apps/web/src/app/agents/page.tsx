'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell, Card, Pill } from '@/components/shell';
import { Alert, Button } from '@/components/ui';
import { api, type Me } from '@/lib/api';
import { when } from '@/lib/format';
import { t } from '@/lib/strings';

interface AgentView {
  key: string;
  name: string;
  role: string;
  state: string;
  stateReason: string | null;
  stateChangedAt: string;
  errorMessage: string | null;
  available: boolean;
  availableFromPhase: number;
  schedule: { workingDays: number[]; startTime: string; endTime: string };
  inWorkingHours: boolean;
  dailyTaskLimit: number;
  tasksToday: number;
  failuresToday: number;
  queued: number;
  currentJob: { type: string; startedAt: string } | null;
  recentJobs: { id: string; type: string; status: string; finishedAt: string | null; lastError: string | null }[];
  allowedActions: string[];
}
interface Overview {
  agents: AgentView[];
  worker: { lastRunAt: string | null; healthy: boolean; lastError: string | null };
  queue: { queued: number; running: number; dead: number };
}

const TONE: Record<string, 'ok' | 'warn' | 'bad' | 'muted' | 'gold'> = {
  RUNNING: 'ok',
  SCHEDULED: 'gold',
  PAUSING: 'warn',
  PAUSED: 'warn',
  STOPPING: 'warn',
  ERROR: 'bad',
  STOPPED: 'muted',
  DISABLED: 'muted',
  DRAFT: 'muted',
};

export default function AgentsPage() {
  return <AppShell title={t.agents.title}>{(me) => <Agents me={me} />}</AppShell>;
}

function Agents({ me }: { me: Me }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const canControl = me.permissions.includes('agents.control');

  const load = useCallback(() => api<Overview>('/control/overview').then(setData), []);
  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
    // Real state comes from the server; poll every 5 s (A2: polling, no WebSockets).
    const timer = setInterval(() => void load().catch(() => undefined), 5000);
    return () => clearInterval(timer);
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
    await load().catch(() => undefined);
  };

  if (!data) return error ? <Alert kind="error">{error}</Alert> : null;
  const lastRun = when(data.worker.lastRunAt, t.integrations.never);

  return (
    <div className="grid gap-4">
      <p className="text-sm text-mist">{t.agents.intro}</p>
      {error && <Alert kind="error">{error}</Alert>}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">{t.agents.worker}</h2>
            <p className={`text-sm ${data.worker.healthy ? 'text-ok' : 'text-bad'}`}>
              {data.worker.healthy ? t.agents.workerOk(lastRun) : t.agents.workerBad(lastRun)}
            </p>
            <p className="text-xs text-mist">{t.agents.queue(data.queue)}</p>
          </div>
          {canControl && (
            <button
              type="button"
              className="rounded-xl border border-bad/60 px-4 py-2 text-sm text-bad hover:bg-bad hover:text-ink"
              onClick={() =>
                window.confirm(t.agents.stopAllConfirm) && act(() => api('/control/stop-all', { method: 'POST' }))
              }
            >
              {t.agents.stopAll}
            </button>
          )}
        </div>
      </Card>
      <ul className="grid gap-3 md:grid-cols-2">
        {data.agents.map((a) => (
          <li key={a.key}>
            <AgentCard
              a={a}
              canControl={canControl}
              act={act}
              open={open === a.key}
              toggle={() => setOpen(open === a.key ? null : a.key)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function AgentCard({
  a,
  canControl,
  act,
  open,
  toggle,
}: {
  a: AgentView;
  canControl: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  open: boolean;
  toggle: () => void;
}) {
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void act(() =>
      api(`/agents/${a.key}/settings`, {
        method: 'POST',
        body: {
          workingDays: f.getAll('day').map(Number),
          startTime: f.get('startTime'),
          endTime: f.get('endTime'),
          dailyTaskLimit: Number(f.get('limit')),
        },
      }),
    );
  };
  return (
    <Card className={a.available ? '' : 'opacity-70'}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{a.name}</h2>
          <p className="text-xs text-mist">{a.role}</p>
        </div>
        <Pill tone={TONE[a.state] ?? 'muted'}>{t.agents.state[a.state]}</Pill>
      </div>
      <p className="mb-3 text-xs text-mist">
        {a.stateReason ? `${t.agents.reason[a.stateReason] ?? a.stateReason} · ` : ''}
        {when(a.stateChangedAt)}
      </p>
      {!a.available && <p className="mb-3 text-sm text-gold">{t.agents.notYet(a.availableFromPhase)}</p>}
      {a.errorMessage && <Alert kind="error">{a.errorMessage}</Alert>}
      {a.available && (
        <dl className="mb-3 grid gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-mist">{t.agents.current}</dt>
            <dd>{a.currentJob ? (t.agents.jobType[a.currentJob.type] ?? a.currentJob.type) : t.agents.idle}</dd>
          </div>
          <div className="text-xs text-mist">
            {t.agents.tasksToday(a.tasksToday, a.dailyTaskLimit)} · {t.agents.queued(a.queued)} ·{' '}
            {t.agents.failures(a.failuresToday)}
          </div>
          <div className="text-xs text-mist">
            {a.schedule.workingDays.map((d) => t.agents.days[d - 1]).join(', ')} · {a.schedule.startTime}–
            {a.schedule.endTime} ({a.inWorkingHours ? t.agents.inHours : t.agents.offHours})
          </div>
        </dl>
      )}
      {canControl && a.allowedActions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {a.allowedActions.map((action) => (
            <button
              key={action}
              type="button"
              className={`min-h-10 rounded-xl border px-3 text-sm ${action === 'stop' || action === 'disable' ? 'border-bad/50 text-bad' : 'border-gold/50 text-gold'} hover:bg-panel`}
              onClick={() => act(() => api(`/agents/${a.key}/${action}`, { method: 'POST' }))}
            >
              {t.agents.action[action]}
            </button>
          ))}
        </div>
      )}
      {a.available && (
        <button type="button" className="text-sm text-mist underline-offset-4 hover:underline" onClick={toggle}>
          {open ? '▲' : '▼'} {t.agents.schedule} · {t.agents.recent}
        </button>
      )}
      {open && (
        <div className="mt-3 grid gap-3 border-t border-line pt-3">
          {canControl && (
            <form onSubmit={save} className="grid gap-2">
              <fieldset className="flex flex-wrap gap-1">
                <legend className="mb-1 text-xs text-mist">{t.agents.schedule}</legend>
                {t.agents.days.map((label, i) => (
                  <label
                    key={label}
                    className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs"
                  >
                    <input
                      type="checkbox"
                      name="day"
                      value={i + 1}
                      defaultChecked={a.schedule.workingDays.includes(i + 1)}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <div className="flex flex-wrap gap-2 text-xs">
                <label>
                  <span className="block text-mist">{t.agents.from}</span>
                  <input
                    type="time"
                    name="startTime"
                    defaultValue={a.schedule.startTime}
                    className="rounded-lg border border-line bg-ink px-2 py-1"
                  />
                </label>
                <label>
                  <span className="block text-mist">{t.agents.to}</span>
                  <input
                    type="time"
                    name="endTime"
                    defaultValue={a.schedule.endTime}
                    className="rounded-lg border border-line bg-ink px-2 py-1"
                  />
                </label>
                <label>
                  <span className="block text-mist">{t.agents.limit}</span>
                  <input
                    type="number"
                    name="limit"
                    min={1}
                    max={10000}
                    defaultValue={a.dailyTaskLimit}
                    className="w-24 rounded-lg border border-line bg-ink px-2 py-1"
                  />
                </label>
              </div>
              <Button type="submit" variant="ghost">
                {t.agents.save}
              </Button>
            </form>
          )}
          <ul className="grid gap-1 text-xs">
            {a.recentJobs.map((j) => (
              <li key={j.id} className="flex justify-between gap-2">
                <span>{t.agents.jobType[j.type] ?? j.type}</span>
                <span className={j.status === 'SUCCEEDED' ? 'text-ok' : 'text-bad'}>
                  {t.agents.jobStatus[j.status] ?? j.status} · {when(j.finishedAt)}
                </span>
              </li>
            ))}
            {a.recentJobs.length === 0 && <li className="text-mist">—</li>}
          </ul>
        </div>
      )}
    </Card>
  );
}
