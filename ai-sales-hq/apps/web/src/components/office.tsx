'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { t } from '@/lib/strings';

export interface OfficeAgent {
  key: string;
  name: string;
  room: string;
  state: string;
  pose: 'working' | 'idle' | 'off_hours' | 'paused' | 'stopping' | 'error' | 'absent';
  currentJobType: string | null;
  lastJobType?: string | null;
  lastJobFinishedAt?: string | null;
}

type Pose = OfficeAgent['pose'];

/*
 * Virtual office (A13): one photographic-style scene of a night-time tech office, drawn in SVG +
 * CSS (no 3D engine, no raster photos). Every person, screen and light is driven by the agent's
 * persisted state (`pose`, computed on the server); an agent that is not working has an empty
 * chair. Labels and the wall display are HTML on top of the SVG, sized with container units.
 */

const VW = 1600;
const VH = 900;

const STATUS_COLOR: Record<Pose, string> = {
  working: '#3fd69a',
  idle: '#e7c27d',
  off_hours: '#8a93a3',
  paused: '#f0ad4e',
  stopping: '#f0ad4e',
  error: '#ff6b5e',
  absent: '#8a93a3',
};

const AGENT_ICON: Record<string, IconName> = {
  director: 'grid',
  market_research: 'search',
  business_analyst: 'trend',
  sales: 'coin',
  communication: 'send',
  order_manager: 'box',
};

// Desk positions: front row is closer to the camera (larger), back row smaller.
interface Seat {
  cx: number;
  base: number;
  s: number;
}
const FRONT: Seat[] = [
  { cx: 330, base: 772, s: 1.55 },
  { cx: 800, base: 772, s: 1.55 },
  { cx: 1270, base: 772, s: 1.55 },
];
const BACK: Seat[] = [
  { cx: 520, base: 640, s: 1 },
  { cx: 800, base: 640, s: 1 },
  { cx: 1080, base: 640, s: 1 },
];
// Director in the centre of the front row, like the head of the team.
const SEAT_BY_KEY: Record<string, Seat> = {
  market_research: FRONT[0] as Seat,
  director: FRONT[1] as Seat,
  sales: FRONT[2] as Seat,
  business_analyst: BACK[0] as Seat,
  communication: BACK[1] as Seat,
  order_manager: BACK[2] as Seat,
};
const ALL_SEATS = [...FRONT, ...BACK];

// Appearance per person (hair, skin, clothing) so the team does not look cloned.
const LOOKS = [
  { hair: '#17110d', skin: '#b98a6a', top: '#1c2230', long: false, bun: false },
  { hair: '#2b1d14', skin: '#c99c7a', top: '#262a33', long: true, bun: false },
  { hair: '#0f0d0c', skin: '#a77b5b', top: '#20262f', long: false, bun: false },
  { hair: '#3a2a1e', skin: '#d4a988', top: '#2b2a2f', long: false, bun: true },
  { hair: '#120f0d', skin: '#9c7254', top: '#1d2a2a', long: false, bun: false },
  { hair: '#24170f', skin: '#c49373', top: '#2a2533', long: true, bun: false },
];
type Look = (typeof LOOKS)[number];

function tashkentClock(): { time: string; hour: number; date: string } {
  const d = new Date(Date.now() + 5 * 3600_000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  return { time: `${hh}:${mm}`, hour: d.getUTCHours(), date: `${dd}.${mo}.${d.getUTCFullYear()}` };
}

function hhmm(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 5 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;

export function Office({ agents, workerHealthy }: { agents: OfficeAgent[]; workerHealthy: boolean | null }) {
  const [clock, setClock] = useState<{ time: string; hour: number; date: string } | null>(null);
  useEffect(() => {
    setClock(tashkentClock());
    const id = setInterval(() => setClock(tashkentClock()), 30_000);
    return () => clearInterval(id);
  }, []);
  const night = clock ? clock.hour < 7 || clock.hour >= 19 : true;
  // On narrow screens the scene scrolls sideways: start centred on the wall display.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, []);
  const running = agents.filter((a) => a.state === 'RUNNING').length;

  const placed = agents.map((a, i) => ({
    agent: a,
    seat: SEAT_BY_KEY[a.key] ?? (ALL_SEATS[i % ALL_SEATS.length] as Seat),
    look: LOOKS[i % LOOKS.length] as Look,
  }));
  // Paint back row first so front-row people overlap it.
  const ordered = [...placed].sort((a, b) => a.seat.base - b.seat.base);
  const paused = placed.filter((p) => p.agent.pose === 'paused');

  const roomLabel = (a: OfficeAgent) => t.office.rooms[a.room] ?? a.room;
  const hqLabel = t.office.rooms.hq ?? 'HQ';

  return (
    <div className="surface overflow-hidden rounded-2xl border border-line">
      {/* The scene keeps a readable size on phones: it scrolls sideways inside its frame. */}
      <div ref={scroller} className="overflow-x-auto overscroll-x-contain">
        <div className="relative min-w-[760px] [container-type:inline-size]" style={{ aspectRatio: `${VW} / ${VH}` }}>
          <svg viewBox={`0 0 ${VW} ${VH}`} className="absolute inset-0 h-full w-full" role="presentation">
            <SceneDefs />
            <Architecture night={night} />
            <Lounge people={paused.map((p) => p.look)} />
            {ordered.map(({ agent, seat, look }) => (
              <Workstation key={agent.key} agent={agent} seat={seat} look={look} />
            ))}
            <Foreground />
          </svg>

          {/* Wall display: the live agents panel (HTML, scaled with the scene) */}
          <Link
            href="/agents/"
            aria-label={`${hqLabel}. ${t.office.hqSummary(running, agents.length)}`}
            className="absolute overflow-hidden rounded-[0.35cqw] text-white transition-[filter] hover:brightness-110"
            style={{ left: pct(436, VW), top: pct(136, VH), width: pct(728, VW), height: pct(288, VH) }}
          >
            <WallDisplay agents={agents} workerHealthy={workerHealthy} clock={clock} />
          </Link>

          {/* Status labels above each person */}
          {placed.map(({ agent, seat }) => {
            const x = seat.cx;
            const y = seat.base - 132 * seat.s;
            return (
              <Link
                key={agent.key}
                href={`/agents/#${agent.key}`}
                aria-label={`${roomLabel(agent)}. ${agent.name}: ${t.office.pose[agent.pose]}`}
                className="-translate-x-1/2 -translate-y-full absolute"
                style={{ left: pct(x, VW), top: pct(y, VH) }}
              >
                <AgentLabel agent={agent} big={seat.s > 1.2} />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Text summary under the scene (phones and screen readers); the labels above are the links. */}
      <ul className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-line px-4 py-3 text-[13px] sm:grid-cols-2 xl:grid-cols-3">
        <li className="flex min-w-0 items-center gap-2">
          <Dot color={workerHealthy === false ? STATUS_COLOR.error : STATUS_COLOR.working} />
          <span className="font-medium">{hqLabel}</span>
          <span className="truncate text-mist">
            {workerHealthy === false ? t.office.workerBad : t.office.hqSummary(running, agents.length)}
          </span>
        </li>
        {agents.map((a) => (
          <li key={a.key} className="flex min-w-0 items-center gap-2">
            <Dot color={STATUS_COLOR[a.pose]} pulse={a.pose === 'working'} />
            <span className="shrink-0 font-medium">{a.name}</span>
            <span className="truncate text-mist">{statusText(a)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function statusText(a: OfficeAgent): string {
  if (a.pose === 'working' && a.currentJobType) return t.office.job[a.currentJobType] ?? t.office.pose.working ?? '';
  return t.office.pose[a.pose] ?? a.pose;
}

function Dot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex size-2 shrink-0">
      {pulse && (
        <span
          className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
          style={{ background: color }}
        />
      )}
      <span className="relative inline-flex size-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

// ------------------------------------------------------------------ HTML overlays

function AgentLabel({ agent, big }: { agent: OfficeAgent; big: boolean }) {
  const color = STATUS_COLOR[agent.pose];
  const icon = AGENT_ICON[agent.key] ?? 'agents';
  const ring = big ? '2.4cqw' : '1.9cqw';
  const glyph = big ? '1.3cqw' : '1.05cqw';
  return (
    <span
      className="flex items-center whitespace-nowrap border text-white shadow-[0_0.6cqw_1.6cqw_rgba(0,0,0,0.55)] backdrop-blur-md transition-transform hover:-translate-y-[0.2cqw]"
      style={{
        gap: big ? '0.7cqw' : '0.5cqw',
        padding: big ? '0.45cqw 1cqw 0.45cqw 0.45cqw' : '0.35cqw 0.8cqw 0.35cqw 0.35cqw',
        borderRadius: '0.8cqw',
        background: 'linear-gradient(180deg, rgba(18,22,34,0.82), rgba(10,12,20,0.78))',
        borderColor: `${color}55`,
      }}
    >
      <span
        className="grid shrink-0 place-items-center rounded-full"
        style={{
          width: ring,
          height: ring,
          background: `radial-gradient(circle at 30% 30%, ${color}55, ${color}18)`,
          boxShadow: `0 0 0 0.12cqw ${color}aa, 0 0 1.2cqw ${color}66`,
          color,
        }}
      >
        <Icon name={icon} size={16} style={{ width: glyph, height: glyph }} />
      </span>
      <span className="leading-tight">
        <span className="block font-semibold" style={{ fontSize: big ? '1.05cqw' : '0.85cqw' }}>
          {agent.name}
        </span>
        <span className="block" style={{ fontSize: big ? '0.85cqw' : '0.7cqw', color }}>
          {statusText(agent)}
          {agent.pose === 'working' ? '…' : ''}
        </span>
      </span>
      {agent.pose === 'error' && (
        <span
          className="office-alert grid place-items-center rounded-full font-bold"
          style={{ width: '1.2cqw', height: '1.2cqw', fontSize: '0.8cqw', background: color }}
        >
          !
        </span>
      )}
    </span>
  );
}

function WallDisplay({
  agents,
  workerHealthy,
  clock,
}: {
  agents: OfficeAgent[];
  workerHealthy: boolean | null;
  clock: { time: string; date: string } | null;
}) {
  const recent = agents
    .filter((a) => a.lastJobFinishedAt && a.lastJobType)
    .sort((a, b) => (b.lastJobFinishedAt ?? '').localeCompare(a.lastJobFinishedAt ?? ''))
    .slice(0, 5);
  const ok = workerHealthy !== false;
  return (
    <div
      className="flex h-full flex-col"
      style={{
        padding: '0.8cqw 1.1cqw',
        background:
          'radial-gradient(120% 90% at 0% 0%, rgba(80,110,255,0.18), transparent 55%), linear-gradient(180deg, #0c1222 0%, #080c18 100%)',
        fontSize: '0.8cqw',
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: '0.5cqw' }}>
        <div className="flex items-center" style={{ gap: '0.6cqw' }}>
          <span
            className="grid place-items-center rounded-[0.3cqw] bg-[#3fd69a]/15 text-[#3fd69a]"
            style={{ width: '1.7cqw', height: '1.7cqw' }}
          >
            <Icon name="agents" size={14} style={{ width: '1.1cqw', height: '1.1cqw' }} />
          </span>
          <span className="font-semibold" style={{ fontSize: '1.25cqw' }}>
            {t.office.screenTitle}
          </span>
          <span
            className="flex items-center rounded-full"
            style={{
              gap: '0.35cqw',
              padding: '0.15cqw 0.6cqw',
              fontSize: '0.72cqw',
              color: ok ? '#3fd69a' : '#ff6b5e',
              background: ok ? 'rgba(63,214,154,0.12)' : 'rgba(255,107,94,0.12)',
            }}
          >
            <span
              className="rounded-full"
              style={{ width: '0.45cqw', height: '0.45cqw', background: 'currentColor' }}
            />
            {ok ? t.office.screenAllOk : t.office.workerBad}
          </span>
        </div>
        {clock && (
          <div className="text-right leading-none tabular-nums">
            <div className="font-semibold" style={{ fontSize: '1.5cqw' }}>
              {clock.time}
            </div>
            <div className="text-white/50" style={{ fontSize: '0.65cqw', marginTop: '0.25cqw' }}>
              {clock.date} · Toshkent
            </div>
          </div>
        )}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1.45fr_1fr]" style={{ gap: '1cqw' }}>
        <ul className="grid content-start" style={{ gap: '0.28cqw' }}>
          {agents.map((a) => {
            const color = STATUS_COLOR[a.pose];
            return (
              <li
                key={a.key}
                className="grid items-center rounded-[0.3cqw] bg-white/[0.035]"
                style={{ gridTemplateColumns: '1.4cqw 1fr 7.5cqw 6cqw', gap: '0.6cqw', padding: '0.22cqw 0.5cqw' }}
              >
                <span
                  className="grid place-items-center rounded-full"
                  style={{ width: '1.4cqw', height: '1.4cqw', background: `${color}22`, color }}
                >
                  <Icon name={AGENT_ICON[a.key] ?? 'agents'} size={12} style={{ width: '0.9cqw', height: '0.9cqw' }} />
                </span>
                <span className="truncate font-medium">{a.name}</span>
                <span className="flex items-center truncate" style={{ gap: '0.3cqw', color, fontSize: '0.72cqw' }}>
                  <span
                    className="shrink-0 rounded-full"
                    style={{ width: '0.4cqw', height: '0.4cqw', background: color }}
                  />
                  {t.office.roomStatus[a.pose]}
                </span>
                <ActivityMeter pose={a.pose} />
              </li>
            );
          })}
        </ul>
        <div className="min-w-0 rounded-[0.3cqw] bg-white/[0.03]" style={{ padding: '0.6cqw 0.8cqw' }}>
          <div className="font-semibold text-white/80" style={{ fontSize: '0.85cqw', marginBottom: '0.5cqw' }}>
            {t.office.screenActivity}
          </div>
          {recent.length === 0 ? (
            <div className="text-white/45" style={{ fontSize: '0.72cqw' }}>
              {t.office.screenNoActivity}
            </div>
          ) : (
            <ul className="grid" style={{ gap: '0.55cqw' }}>
              {recent.map((a) => (
                <li
                  key={a.key}
                  className="grid grid-cols-[auto_1fr] leading-snug"
                  style={{ gap: '0.6cqw', fontSize: '0.72cqw' }}
                >
                  <span className="text-white/45 tabular-nums">{hhmm(a.lastJobFinishedAt as string)}</span>
                  <span className="min-w-0">
                    <span className="font-medium text-white/90">{a.name}</span>{' '}
                    <span className="text-white/55">{t.office.jobDone[a.lastJobType as string] ?? a.lastJobType}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Activity strip: animated only while a job really runs; no invented percentages. */
function ActivityMeter({ pose }: { pose: Pose }) {
  const color = STATUS_COLOR[pose];
  const fill =
    pose === 'working' || pose === 'error'
      ? 1
      : pose === 'idle'
        ? 0.18
        : pose === 'paused' || pose === 'stopping'
          ? 0.4
          : 0;
  return (
    <span className="relative block overflow-hidden rounded-full bg-white/10" style={{ height: '0.35cqw' }}>
      <span
        className={`absolute inset-y-0 left-0 rounded-full ${pose === 'working' ? 'office-meter' : ''}`}
        style={{
          width: `${fill * 100}%`,
          background: pose === 'working' ? `linear-gradient(90deg, ${color}33, ${color}, ${color}33)` : color,
          backgroundSize: '200% 100%',
          opacity: pose === 'error' ? 0.8 : 1,
        }}
      />
    </span>
  );
}

// ------------------------------------------------------------------ SVG scene

function SceneDefs() {
  return (
    <defs>
      <linearGradient id="of-ceiling" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#07080b" />
        <stop offset="1" stopColor="#121318" />
      </linearGradient>
      <linearGradient id="of-wood" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3a2a1d" />
        <stop offset="0.55" stopColor="#2a1e15" />
        <stop offset="1" stopColor="#1a130e" />
      </linearGradient>
      <pattern id="of-slats" width="22" height="465" patternUnits="userSpaceOnUse" y="95">
        <rect width="22" height="465" fill="url(#of-wood)" />
        <rect x="19" width="3" height="465" fill="#0d0907" opacity="0.75" />
        <rect x="2" width="1" height="465" fill="#ffffff" opacity="0.03" />
      </pattern>
      <linearGradient id="of-sidewall" x1="1" y1="0" x2="0" y2="0">
        <stop offset="0" stopColor="#1f1712" />
        <stop offset="1" stopColor="#0d0a08" />
      </linearGradient>
      <linearGradient id="of-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1d1813" />
        <stop offset="0.5" stopColor="#15110d" />
        <stop offset="1" stopColor="#0b0907" />
      </linearGradient>
      <linearGradient id="of-desk" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8a6141" />
        <stop offset="0.6" stopColor="#6e4c32" />
        <stop offset="1" stopColor="#5a3d28" />
      </linearGradient>
      <linearGradient id="of-desk-edge" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4a3221" />
        <stop offset="1" stopColor="#2d1e14" />
      </linearGradient>
      <linearGradient id="of-metal" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#2a2d33" />
        <stop offset="0.5" stopColor="#5b6068" />
        <stop offset="1" stopColor="#25282d" />
      </linearGradient>
      <linearGradient id="of-screen-on" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#101a33" />
        <stop offset="1" stopColor="#0a1124" />
      </linearGradient>
      <linearGradient id="of-screen-idle" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#1d3566" />
        <stop offset="0.6" stopColor="#2a2350" />
        <stop offset="1" stopColor="#141a33" />
      </linearGradient>
      <linearGradient id="of-screen-err" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3a0f12" />
        <stop offset="1" stopColor="#220a0c" />
      </linearGradient>
      <linearGradient id="of-screen-off" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#0c0d10" />
        <stop offset="0.45" stopColor="#15171c" />
        <stop offset="0.5" stopColor="#0e0f12" />
        <stop offset="1" stopColor="#08090b" />
      </linearGradient>
      <radialGradient id="of-pool" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#ffcf8f" stopOpacity="0.38" />
        <stop offset="1" stopColor="#ffcf8f" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="of-vignette" cx="0.5" cy="0.45" r="0.75">
        <stop offset="0.55" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.62" />
      </radialGradient>
      <linearGradient id="of-sheen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
        <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="of-mesh" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1b1d22" />
        <stop offset="1" stopColor="#0d0e11" />
      </linearGradient>
      <pattern id="of-meshgrid" width="4" height="4" patternUnits="userSpaceOnUse">
        <rect width="4" height="4" fill="url(#of-mesh)" />
        <path d="M0 0L4 4M4 0L0 4" stroke="#2b2e35" strokeWidth="0.5" />
      </pattern>
      <filter id="of-blur-s" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" />
      </filter>
      <filter id="of-blur-m" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="10" />
      </filter>
      <filter id="of-blur-l" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="24" />
      </filter>
      <filter id="of-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <clipPath id="of-window">
        <polygon points="18,30 286,108 286,548 18,862" />
      </clipPath>
    </defs>
  );
}

// Right wall edges (x from 1300 at the back wall to 1600 at the camera).
const rTop = (x: number) => 95 - ((x - 1300) * 95) / 300;
const rBot = (x: number) => 560 + ((x - 1300) * 340) / 300;
const rY = (x: number, f: number) => rTop(x) + f * (rBot(x) - rTop(x));
// Left window edges.
const lTop = (x: number) => 30 + ((x - 18) * 78) / 268;
const lBot = (x: number) => 862 - ((x - 18) * 314) / 268;

// Deterministic skyline (same every render).
const TOWERS = (() => {
  const out: { x: number; w: number; h: number; lit: number; windows: { x: number; y: number; warm: boolean }[] }[] =
    [];
  let x = -10;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  while (x < 300) {
    const w = 22 + rnd() * 34;
    out.push({ x, w, h: 120 + rnd() * 330, lit: rnd(), windows: [] as { x: number; y: number; warm: boolean }[] });
    x += w + 3;
  }
  for (const tw of out) {
    for (let row = 0; row < Math.floor(tw.h / 14); row++) {
      for (let col = 0; col < Math.max(1, Math.floor(tw.w / 9)); col++) {
        if ((row * 7 + col * 13 + Math.floor(tw.lit * 100)) % 5 === 0) {
          tw.windows.push({ x: tw.x + 3 + col * 9, y: 620 - tw.h + 6 + row * 14, warm: (row + col) % 3 !== 0 });
        }
      }
    }
  }
  return out;
})();

function Architecture({ night }: { night: boolean }) {
  const floorLines = [-600, -300, 0, 200, 400, 600, 800, 1000, 1200, 1400, 1600, 1900, 2200];
  const strips: [number, number][] = [
    [400, 500],
    [800, 800],
    [1200, 1100],
  ];
  const screen = (f1: number, f2: number) =>
    `1330,${rY(1330, f1)} 1490,${rY(1490, f1)} 1490,${rY(1490, f2)} 1330,${rY(1330, f2)}`;
  return (
    <g>
      {/* ceiling with linear lights running towards the vanishing point */}
      <polygon points="0,0 1600,0 1300,95 300,95" fill="url(#of-ceiling)" />
      {strips.map(([front, back]) => {
        const pts = `${front - 13},0 ${front + 13},0 ${back + 4},95 ${back - 4},95`;
        return (
          <g key={front}>
            <polygon points={pts} fill="#fff3dc" opacity="0.85" />
            <polygon points={pts} fill="#ffd9a3" opacity="0.5" filter="url(#of-blur-s)" />
          </g>
        );
      })}

      {/* back wall: wooden slats, cove light at the top, warm uplight */}
      <rect x="300" y="95" width="1000" height="465" fill="url(#of-slats)" />
      <rect x="300" y="95" width="1000" height="465" fill="#000" opacity="0.28" />
      <rect x="300" y="93" width="1000" height="6" fill="#ffd59a" opacity="0.9" filter="url(#of-blur-s)" />
      <rect x="300" y="95" width="1000" height="70" fill="#ffc77d" opacity="0.1" filter="url(#of-blur-m)" />

      {/* neon brand sign */}
      <g>
        <rect
          x="318"
          y="160"
          width="96"
          height="96"
          rx="20"
          fill="none"
          stroke="#7aa2ff"
          strokeWidth="10"
          opacity="0.35"
          filter="url(#of-blur-m)"
        />
        <rect x="318" y="160" width="96" height="96" rx="20" fill="#0b1020" stroke="#9db8ff" strokeWidth="3" />
        <path
          d="M344 186v30a22 22 0 0 0 44 0v-30M366 186v36"
          fill="none"
          stroke="#7aa2ff"
          strokeWidth="12"
          strokeLinecap="round"
          opacity="0.4"
          filter="url(#of-blur-s)"
        />
        <path
          d="M344 186v30a22 22 0 0 0 44 0v-30M366 186v36"
          fill="none"
          stroke="#c9d7ff"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <text x="366" y="290" textAnchor="middle" fontSize="10.5" fontWeight="700" letterSpacing="1" fill="#c9d7ff">
          UNUTILMAS TA&apos;M
        </text>
        <text x="366" y="307" textAnchor="middle" fontSize="7.5" letterSpacing="1" fill="#8fa6e6" opacity="0.85">
          {t.office.sign}
        </text>
      </g>

      {/* wall display frame and glow (content is HTML) */}
      <rect x="420" y="124" width="760" height="312" fill="#5b7cff" opacity="0.22" filter="url(#of-blur-l)" />
      <rect x="428" y="128" width="744" height="304" rx="6" fill="#050608" stroke="#23252b" strokeWidth="2" />

      {/* plant and shelf on the right of the back wall */}
      <Plant x={1235} y={556} s={1.25} />
      <rect x="1190" y="300" width="96" height="6" fill="#4a3424" />
      <rect x="1196" y="268" width="14" height="32" fill="#c9b79a" opacity="0.7" />
      <rect x="1213" y="274" width="10" height="26" fill="#6f8db5" opacity="0.7" />
      <rect x="1226" y="270" width="12" height="30" fill="#b06b4b" opacity="0.7" />

      {/* left wall: floor-to-ceiling window with the city */}
      <polygon points="0,0 300,95 300,560 0,900" fill="url(#of-sidewall)" />
      <g clipPath="url(#of-window)">
        <rect x="0" y="0" width="300" height="900" fill={night ? '#0b1430' : '#4d6fa8'} />
        <rect
          x="0"
          y="0"
          width="300"
          height="900"
          fill={night ? '#3b2a6b' : '#f2b77a'}
          opacity="0.35"
          filter="url(#of-blur-l)"
        />
        <rect
          x="0"
          y="420"
          width="300"
          height="200"
          fill={night ? '#7a4a8f' : '#ffd9a8'}
          opacity="0.35"
          filter="url(#of-blur-l)"
        />
        {TOWERS.map((tw) => (
          <g key={tw.x}>
            <rect x={tw.x} y={620 - tw.h} width={tw.w} height={tw.h + 300} fill={night ? '#0a0e1a' : '#2b3550'} />
            {night &&
              tw.windows.map((w) => (
                <rect
                  key={`${w.x}-${w.y}`}
                  x={w.x}
                  y={w.y}
                  width="4"
                  height="6"
                  fill={w.warm ? '#ffd28a' : '#9cc3ff'}
                  opacity="0.75"
                />
              ))}
          </g>
        ))}
        <rect x="0" y="0" width="300" height="900" fill="url(#of-sheen)" opacity="0.6" />
        <polygon points="40,40 140,70 40,700" fill="#ffffff" opacity="0.04" />
      </g>
      {[18, 112, 200, 286].map((mx) => (
        <line key={mx} x1={mx} y1={lTop(mx)} x2={mx} y2={lBot(mx)} stroke="#1a1c21" strokeWidth={mx === 18 ? 10 : 6} />
      ))}
      <line x1="18" y1="30" x2="286" y2="108" stroke="#1a1c21" strokeWidth="6" />
      <line x1="18" y1="862" x2="286" y2="548" stroke="#1a1c21" strokeWidth="8" />

      {/* right wall: dark wood with a small status screen */}
      <polygon points="1600,0 1300,95 1300,560 1600,900" fill="url(#of-sidewall)" />
      <polygon points={screen(0.2, 0.45)} fill="#7a5cff" opacity="0.25" filter="url(#of-blur-m)" />
      <polygon points={screen(0.2, 0.45)} fill="#0a0d18" stroke="#2a2d36" strokeWidth="2" />
      {[0.26, 0.31, 0.36, 0.41].map((f, i) => (
        <line
          key={f}
          x1={1345}
          y1={rY(1345, f)}
          x2={1345 + 60 + i * 18}
          y2={rY(1345 + 60 + i * 18, f)}
          stroke={i === 0 ? '#a58bff' : '#5c6b9a'}
          strokeWidth={i === 0 ? 4 : 3}
          strokeLinecap="round"
        />
      ))}
      <Plant x={1420} y={rY(1420, 1) - 4} s={1.7} />

      {/* floor: dark timber with soft reflections of the screen and lights */}
      <polygon points="300,560 1300,560 1600,900 0,900" fill="url(#of-floor)" />
      {floorLines.map((fx) => (
        <line
          key={fx}
          x1={fx + (800 - fx) * 0.654}
          y1="560"
          x2={fx}
          y2="900"
          stroke="#000"
          strokeOpacity="0.35"
          strokeWidth="1.2"
        />
      ))}
      <rect x="470" y="565" width="660" height="120" fill="#5b7cff" opacity="0.1" filter="url(#of-blur-l)" />
      <rect x="300" y="556" width="1000" height="8" fill="#000" opacity="0.5" filter="url(#of-blur-s)" />
    </g>
  );
}

const LEAVES: [number, number, number][] = [
  [-18, -70, -40],
  [14, -78, 35],
  [-4, -96, -8],
  [-26, -48, -70],
  [24, -52, 65],
  [6, -64, 15],
];

function Plant({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="2" rx="22" ry="5" fill="#000" opacity="0.4" />
      <path d="M-16 -26 L16 -26 L12 0 L-12 0 Z" fill="#2c2b2a" />
      <path d="M-16 -26 L16 -26 L15 -21 L-15 -21 Z" fill="#3b3a38" />
      {LEAVES.map(([lx, ly, rot]) => (
        <ellipse
          key={`${lx}${ly}`}
          cx={lx}
          cy={ly}
          rx="8"
          ry="26"
          transform={`rotate(${rot} ${lx} ${ly})`}
          fill="#1f3a26"
          stroke="#2f5638"
          strokeWidth="1"
        />
      ))}
    </g>
  );
}

function screenFill(pose: Pose): string {
  if (pose === 'working') return 'url(#of-screen-on)';
  if (pose === 'error') return 'url(#of-screen-err)';
  if (pose === 'idle' || pose === 'stopping') return 'url(#of-screen-idle)';
  return 'url(#of-screen-off)';
}

/** Desk with monitors, chair and — only when the agent is at work — the person. */
function Workstation({ agent, seat, look }: { agent: OfficeAgent; seat: Seat; look: Look }) {
  const pose = agent.pose;
  const present = pose === 'working' || pose === 'idle' || pose === 'error' || pose === 'stopping';
  const glow = STATUS_COLOR[pose];
  const wide = seat.s > 1.2;
  const monitors = wide ? [-62, 0, 62] : [-48, 48];
  const mw = wide ? 60 : 84;
  return (
    <g transform={`translate(${seat.cx} ${seat.base}) scale(${seat.s})`}>
      {/* pendant lamp */}
      <line x1="0" y1={-seat.base / seat.s} x2="0" y2="-150" stroke="#2a2b2f" strokeWidth="1" />
      <path d="M-14 -150 L14 -150 L9 -140 L-9 -140 Z" fill="#1d1e22" />
      {present && <ellipse cx="0" cy="-139" rx="10" ry="2.5" fill="#ffe2b0" />}
      {present && <ellipse cx="0" cy="-12" rx="150" ry="34" fill="url(#of-pool)" />}

      {/* light spill of the screens */}
      {present && <ellipse cx="0" cy="-60" rx="120" ry="40" fill={glow} opacity="0.13" filter="url(#of-blur-m)" />}

      {/* desk: shadow, legs, top, edge */}
      <ellipse cx="0" cy="52" rx="140" ry="12" fill="#000" opacity="0.45" filter="url(#of-blur-s)" />
      <rect x="-118" y="6" width="5" height="44" fill="url(#of-metal)" />
      <rect x="113" y="6" width="5" height="44" fill="url(#of-metal)" />
      <rect x="-4" y="6" width="8" height="40" fill="url(#of-metal)" opacity="0.6" />
      <polygon points="-112,-28 112,-28 126,0 -126,0" fill="url(#of-desk)" />
      <polygon points="-112,-28 112,-28 126,0 -126,0" fill="#000" opacity="0.15" />
      <rect x="-126" y="0" width="252" height="6" fill="url(#of-desk-edge)" />

      {/* monitors */}
      {monitors.map((mx, i) => (
        <g key={mx}>
          <rect x={mx - 3} y="-36" width="6" height="10" fill="#2c2f35" />
          <ellipse cx={mx} cy="-26" rx="14" ry="3" fill="#25282d" />
          <rect x={mx - mw / 2 - 2} y="-90" width={mw + 4} height="56" rx="2" fill="#07080a" />
          <rect x={mx - mw / 2} y="-88" width={mw} height="52" fill={screenFill(pose)} />
          <ScreenContent pose={pose} x={mx - mw / 2} y={-88} w={mw} h={52} variant={i} />
          <rect x={mx - mw / 2} y="-88" width={mw} height="52" fill="url(#of-sheen)" opacity="0.35" />
        </g>
      ))}

      {/* keyboard, mouse, mug */}
      <polygon points="-34,-16 34,-16 37,-8 -37,-8" fill="#17181c" />
      <polygon points="-32,-15 32,-15 34,-10 -34,-10" fill="#24262b" />
      <ellipse cx="50" cy="-11" rx="5" ry="3" fill="#1d1f23" />
      <rect x="-98" y="-24" width="11" height="13" rx="2" fill="#e8e3da" opacity="0.9" />
      <path d="M-87 -21 q5 0 5 4 q0 4 -5 4" fill="none" stroke="#e8e3da" strokeWidth="1.5" opacity="0.9" />

      {/* person seen from behind (only when really at work) */}
      {present && <Person look={look} rim={glow} typing={pose === 'working'} />}

      {/* ergonomic chair */}
      <Chair occupied={present} />
    </g>
  );
}

const CODE_COLORS = ['#6ea8ff', '#3fd69a', '#c38bff', '#e7c27d', '#8bd3ff'];
const CODE_ROWS = Array.from({ length: 14 }, (_, r) => r);

function ScreenContent({
  pose,
  x,
  y,
  w,
  h,
  variant,
}: {
  pose: Pose;
  x: number;
  y: number;
  w: number;
  h: number;
  variant: number;
}) {
  if (pose === 'working') {
    return (
      <g>
        <rect x={x} y={y} width={w} height="5" fill="#16203a" />
        <svg x={x + 3} y={y + 7} width={w - 6} height={h - 9} overflow="hidden" aria-hidden="true">
          <g className="office-scroll">
            {[0, 1].map((rep) =>
              CODE_ROWS.map((r) => (
                <rect
                  key={`${rep}-${r}`}
                  x={((r * 7 + variant * 3) % 4) * 3}
                  y={rep * 56 + r * 4}
                  width={6 + ((r * 13 + variant * 5) % 9) * ((w - 18) / 12)}
                  height="1.8"
                  rx="0.9"
                  fill={CODE_COLORS[(r + variant) % CODE_COLORS.length]}
                  opacity="0.85"
                />
              )),
            )}
          </g>
        </svg>
      </g>
    );
  }
  if (pose === 'error') {
    return (
      <g className={variant === 0 ? 'office-alert' : undefined}>
        <rect x={x + w * 0.2} y={y + h * 0.25} width={w * 0.6} height={h * 0.5} rx="2" fill="#ff6b5e" opacity="0.85" />
        <text x={x + w / 2} y={y + h * 0.62} textAnchor="middle" fontSize="12" fontWeight="800" fill="#2a0707">
          !
        </text>
      </g>
    );
  }
  if (pose === 'idle' || pose === 'stopping') {
    return (
      <rect x={x + w * 0.15} y={y + h * 0.2} width={w * 0.5} height={h * 0.45} rx="1.5" fill="#ffffff" opacity="0.08" />
    );
  }
  return null;
}

function Person({ look, rim, typing }: { look: Look; rim: string; typing: boolean }) {
  return (
    <g className={typing ? 'office-typing' : undefined}>
      {/* arms towards the keyboard */}
      <path d="M-34 -6 C-40 -14 -38 -24 -28 -26 L-20 -14 Z" fill={look.top} />
      <path d="M34 -6 C40 -14 38 -24 28 -26 L20 -14 Z" fill={look.top} />
      {/* torso / hoodie with screen rim light */}
      <path d="M-38 30 C-40 -6 -32 -34 -14 -42 L14 -42 C32 -34 40 -6 38 30 Z" fill={look.top} />
      <path d="M-38 30 C-40 -6 -32 -34 -14 -42 L14 -42 C32 -34 40 -6 38 30 Z" fill="url(#of-sheen)" />
      <path d="M-14 -42 C-32 -34 -40 -6 -38 30" fill="none" stroke={rim} strokeOpacity="0.45" strokeWidth="1.5" />
      <path d="M14 -42 C32 -34 40 -6 38 30" fill="none" stroke={rim} strokeOpacity="0.45" strokeWidth="1.5" />
      <path d="M-15 -42 C-10 -30 10 -30 15 -42" fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="3" />
      {/* neck, ears, head */}
      <rect x="-6" y="-52" width="12" height="12" rx="4" fill={look.skin} />
      <rect x="-6" y="-52" width="12" height="12" rx="4" fill="#000" opacity="0.35" />
      <ellipse cx="-13.5" cy="-64" rx="2.5" ry="4" fill={look.skin} />
      <ellipse cx="13.5" cy="-64" rx="2.5" ry="4" fill={look.skin} />
      <ellipse cx="0" cy="-66" rx="13.5" ry="15.5" fill={look.hair} />
      {look.long && <path d="M-13 -70 C-16 -50 -14 -40 -10 -36 L10 -36 C14 -40 16 -50 13 -70 Z" fill={look.hair} />}
      {look.bun && <circle cx="0" cy="-84" r="6" fill={look.hair} />}
      <path d="M-11 -76 C-6 -82 6 -82 11 -76" fill="none" stroke={rim} strokeOpacity="0.35" strokeWidth="1.2" />
    </g>
  );
}

function Chair({ occupied }: { occupied: boolean }) {
  return (
    <g>
      {/* mesh backrest */}
      <path
        d="M-30 -24 C-31 -34 31 -34 30 -24 L28 22 C20 28 -20 28 -28 22 Z"
        fill="url(#of-meshgrid)"
        stroke="#2f323a"
        strokeWidth="1.5"
      />
      <path d="M-30 -24 C-31 -34 31 -34 30 -24" fill="none" stroke="#4a4e57" strokeWidth="1.5" />
      {!occupied && <path d="M-34 28 L34 28 L30 36 L-30 36 Z" fill="#17181c" />}
      <rect x="-18" y="8" width="36" height="5" rx="2.5" fill="#2a2c32" />
      {/* gas lift and star base */}
      <rect x="-2.5" y="28" width="5" height="16" fill="url(#of-metal)" />
      <path
        d="M0 44 L-26 52 M0 44 L26 52 M0 44 L-12 56 M0 44 L12 56"
        stroke="#2a2c31"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="-26" cy="53" r="2.5" fill="#111" />
      <circle cx="26" cy="53" r="2.5" fill="#111" />
      <circle cx="-12" cy="57" r="2.5" fill="#111" />
      <circle cx="12" cy="57" r="2.5" fill="#111" />
    </g>
  );
}

/** Lounge corner by the window: paused agents sit here instead of at their desks. */
function Lounge({ people }: { people: Look[] }) {
  return (
    <g transform="translate(360 600)">
      <ellipse cx="0" cy="28" rx="92" ry="10" fill="#000" opacity="0.45" filter="url(#of-blur-s)" />
      <rect x="-80" y="-30" width="160" height="34" rx="10" fill="#3b3f4a" />
      {people.slice(0, 2).map((look, i) => (
        <g key={`${look.hair}${look.top}`} transform={`translate(${i === 0 ? -34 : 34} -8) scale(0.85)`}>
          <Person look={look} rim="#f0ad4e" typing={false} />
        </g>
      ))}
      <rect x="-86" y="-4" width="172" height="26" rx="8" fill="#2f333d" />
      <rect x="-92" y="-26" width="16" height="48" rx="7" fill="#353a45" />
      <rect x="76" y="-26" width="16" height="48" rx="7" fill="#353a45" />
      <rect x="-86" y="-4" width="172" height="8" rx="4" fill="#ffffff" opacity="0.05" />
      <rect x="100" y="-10" width="36" height="5" rx="2" fill="#6e4c32" />
      <rect x="116" y="-5" width="4" height="27" fill="url(#of-metal)" />
      <rect x="112" y="-19" width="10" height="9" rx="2" fill="#e8e3da" />
    </g>
  );
}

const FG_LEFT: [number, number, number, number][] = [
  [-10, 820, -30, 1],
  [40, 870, 10, 1.2],
  [90, 900, 40, 0.9],
];
const FG_RIGHT: [number, number, number, number][] = [
  [1600, 840, 30, 1.1],
  [1550, 900, -10, 1],
];

function Foreground(): ReactNode {
  return (
    <g>
      {/* out-of-focus leaves at the edges (depth of field) */}
      <g filter="url(#of-blur-s)" opacity="0.92">
        {[...FG_LEFT, ...FG_RIGHT].map(([lx, ly, rot, sc]) => (
          <ellipse
            key={`${lx}-${ly}`}
            cx={lx}
            cy={ly}
            rx={58 * sc}
            ry={145 * sc}
            transform={`rotate(${rot} ${lx} ${ly})`}
            fill="#12261a"
          />
        ))}
      </g>
      {/* lens: vignette and fine grain */}
      <rect width={VW} height={VH} fill="url(#of-vignette)" />
      <rect width={VW} height={VH} filter="url(#of-grain)" opacity="0.07" style={{ mixBlendMode: 'overlay' }} />
    </g>
  );
}
