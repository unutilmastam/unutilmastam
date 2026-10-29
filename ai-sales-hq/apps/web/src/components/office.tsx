'use client';

import Link from 'next/link';
import { Pill } from '@/components/shell';
import { t } from '@/lib/strings';

export interface OfficeAgent {
  key: string;
  name: string;
  room: string;
  state: string;
  pose: 'working' | 'idle' | 'off_hours' | 'paused' | 'stopping' | 'error' | 'absent';
  currentJobType: string | null;
}

type Pose = OfficeAgent['pose'];

const ROOMS = ['hq', 'director', 'research', 'sales', 'communication', 'orders'] as const;

const POSE_COLOR: Record<Pose, string> = {
  working: 'var(--color-ok)',
  idle: 'var(--color-gold)',
  off_hours: 'var(--color-faint)',
  paused: 'var(--color-warn)',
  stopping: 'var(--color-warn)',
  error: 'var(--color-bad)',
  absent: 'var(--color-faint)',
};
const POSE_TONE: Record<Pose, 'ok' | 'gold' | 'muted' | 'warn' | 'bad'> = {
  working: 'ok',
  idle: 'gold',
  off_hours: 'muted',
  paused: 'warn',
  stopping: 'warn',
  error: 'bad',
  absent: 'muted',
};
// Most important pose first: a room shows the "loudest" state of its agents.
const PRIORITY: Pose[] = ['error', 'working', 'stopping', 'paused', 'idle', 'off_hours', 'absent'];

// ---- isometric projection (units -> px); the room is a 10 x 7 floor with two back walls ----
const S = 19;
const K = 0.866 * S;
const OX = 155;
const OY = 62;
const W = 10;
const D = 7;
const p = (x: number, y: number, z = 0) =>
  `${(OX + (x - y) * K).toFixed(1)},${(OY + (x + y) * 0.5 * S - z * S).toFixed(1)}`;
const poly = (...pts: [number, number, number?][]) => pts.map(([x, y, z]) => p(x, y, z ?? 0)).join(' ');
const at = (x: number, y: number, z = 0) => {
  const [px, py] = p(x, y, z).split(',').map(Number);
  return { x: px as number, y: py as number };
};

function isNight(): boolean {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Tashkent' }).format(new Date()),
  );
  return h < 7 || h >= 19;
}

/**
 * Virtual office (A13): an isometric control room per department, SVG + CSS only. Every marker
 * is derived from persisted state by the server (`pose`), never simulated.
 */
export function Office({ agents, workerHealthy }: { agents: OfficeAgent[]; workerHealthy: boolean | null }) {
  const running = agents.filter((a) => a.state === 'RUNNING').length;
  const night = isNight();
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
      {ROOMS.map((room, index) => {
        const inRoom = agents.filter((a) => a.room === room);
        const label = t.office.rooms[room] ?? room;
        const href = room === 'hq' ? '/agents/' : `/agents/#${inRoom[0]?.key ?? ''}`;
        const description =
          room === 'hq'
            ? t.office.hqSummary(running, agents.length)
            : inRoom.map((a) => `${a.name}: ${t.office.pose[a.pose]}`).join('; ') || t.office.empty;
        const roomPose =
          room === 'hq'
            ? workerHealthy === false
              ? 'error'
              : running > 0
                ? 'working'
                : 'absent'
            : (PRIORITY.find((s) => inRoom.some((a) => a.pose === s)) ?? 'absent');
        return (
          <li key={room} className="min-w-0">
            <Link
              href={href}
              aria-label={`${label}. ${description}`}
              className="surface group block overflow-hidden rounded-2xl border border-line transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong"
            >
              <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="text-[11px] font-semibold tabular-nums text-faint">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate text-[14px] font-semibold tracking-[-0.01em]">{label}</span>
                </div>
                <Pill tone={room === 'hq' && workerHealthy === false ? 'bad' : POSE_TONE[roomPose]}>
                  {room === 'hq'
                    ? workerHealthy === false
                      ? t.office.workerBad
                      : t.office.agentsLive(running, agents.length)
                    : t.office.roomStatus[roomPose]}
                </Pill>
              </div>
              <svg viewBox="0 0 360 228" className="block w-full" role="presentation">
                <Room id={room} night={night} dim={roomPose === 'off_hours' || roomPose === 'absent'} />
                {room === 'hq' ? (
                  <HqScene agents={agents} workerHealthy={workerHealthy} />
                ) : (
                  <>
                    {inRoom.map((a, i) => (
                      <Workstation key={a.key} agent={a} x0={inRoom.length === 1 ? 3.5 : 0.9 + i * 4.6} />
                    ))}
                    <Lounge agents={inRoom.filter((a) => a.pose === 'paused')} />
                  </>
                )}
              </svg>
              <div className="border-t border-line px-4 py-3">
                {room === 'hq' ? (
                  <div className="flex items-center gap-2 text-[13px] text-mist">
                    <Dot color={workerHealthy === false ? 'var(--color-bad)' : 'var(--color-ok)'} />
                    {workerHealthy === null ? description : workerHealthy ? t.office.workerOk : t.office.workerBad}
                  </div>
                ) : inRoom.length === 0 ? (
                  <div className="text-[13px] text-mist">{t.office.empty}</div>
                ) : (
                  <ul className="grid gap-1.5">
                    {inRoom.map((a) => (
                      <li key={a.key} className="flex min-w-0 items-center gap-2 text-[13px]">
                        <Dot color={POSE_COLOR[a.pose]} pulse={a.pose === 'working'} />
                        <span className="shrink-0 font-medium">{a.name}</span>
                        <span className="min-w-0 truncate text-mist">
                          {a.pose === 'working' && a.currentJobType
                            ? (t.office.job[a.currentJobType] ?? t.office.pose.working)
                            : t.office.pose[a.pose]}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
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

function Room({ id, night, dim }: { id: string; night: boolean; dim: boolean }) {
  const gid = `floor-${id}`;
  const wid = `wall-${id}`;
  const win = `win-${id}`;
  const grid = [];
  for (let x = 1; x < W; x++) grid.push(<line key={`x${x}`} {...line(x, 0, x, D)} />);
  for (let y = 1; y < D; y++) grid.push(<line key={`y${y}`} {...line(0, y, W, y)} />);
  return (
    <g>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--office-floor-a)" />
          <stop offset="1" stopColor="var(--office-floor-b)" />
        </linearGradient>
        <linearGradient id={wid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--office-wall)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--office-wall)" />
        </linearGradient>
        <linearGradient id={win} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={night ? '#0d1530' : '#9cc3ff'} stopOpacity={night ? 1 : 0.55} />
          <stop offset="1" stopColor={night ? '#1a2547' : '#e9d9b5'} stopOpacity={night ? 1 : 0.35} />
        </linearGradient>
      </defs>
      {/* back walls */}
      <polygon points={poly([0, 0, 0], [W, 0, 0], [W, 0, 3], [0, 0, 3])} fill={`url(#${wid})`} />
      <polygon points={poly([0, 0, 0], [0, D, 0], [0, D, 3], [0, 0, 3])} fill={`url(#${wid})`} opacity="0.8" />
      {/* window on the right wall */}
      <polygon points={poly([6, 0, 1.2], [9.2, 0, 1.2], [9.2, 0, 2.5], [6, 0, 2.5])} fill={`url(#${win})`} />
      <polyline
        points={poly([7.6, 0, 1.2], [7.6, 0, 2.5])}
        stroke="var(--color-line-strong)"
        strokeWidth="1"
        fill="none"
      />
      {/* floor */}
      <polygon points={poly([0, 0], [W, 0], [W, D], [0, D])} fill={`url(#${gid})`} />
      <g stroke="var(--office-grid)" strokeWidth="1">
        {grid}
      </g>
      {/* skirting: a hairline of the accent where walls meet the floor */}
      <polyline
        points={poly([0, D], [0, 0], [W, 0])}
        fill="none"
        stroke="var(--color-gold)"
        strokeOpacity="0.35"
        strokeWidth="1"
      />
      {dim && <polygon points={poly([0, 0], [W, 0], [W, D], [0, D])} fill="#000" opacity="0.18" />}
    </g>
  );
}

function line(x1: number, y1: number, x2: number, y2: number) {
  const a = at(x1, y1);
  const b = at(x2, y2);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/** An isometric box: top, front-left and front-right faces. */
function Box({
  x,
  y,
  z = 0,
  w,
  d,
  h,
  top = 'var(--office-desk-top)',
  left = 'var(--office-desk-left)',
  right = 'var(--office-desk-right)',
}: {
  x: number;
  y: number;
  z?: number;
  w: number;
  d: number;
  h: number;
  top?: string;
  left?: string;
  right?: string;
}) {
  return (
    <g>
      <polygon points={poly([x, y + d, z + h], [x + w, y + d, z + h], [x + w, y + d, z], [x, y + d, z])} fill={left} />
      <polygon points={poly([x + w, y, z + h], [x + w, y + d, z + h], [x + w, y + d, z], [x + w, y, z])} fill={right} />
      <polygon
        points={poly([x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h])}
        fill={top}
        stroke="rgba(255,255,255,0.05)"
        strokeWidth="0.75"
      />
    </g>
  );
}

function Workstation({ agent, x0 }: { agent: OfficeAgent; x0: number }) {
  const y0 = 1.3;
  const w = 3.6;
  const d = 1.7;
  const h = 0.8;
  const pose = agent.pose;
  const seated = pose === 'working' || pose === 'idle' || pose === 'stopping' || pose === 'error';
  const screen =
    pose === 'working'
      ? 'var(--color-ok)'
      : pose === 'error'
        ? 'var(--color-bad)'
        : pose === 'idle' || pose === 'stopping'
          ? 'var(--color-info)'
          : 'var(--office-screen-off)';
  const lit = pose === 'working' || pose === 'idle' || pose === 'error' || pose === 'stopping';
  const sx = x0 + 0.8;
  const sw = 2;
  const sy = y0 + 0.35;
  const seat = at(x0 + w / 2 + 0.2, y0 + d + 1.15, 0.9);
  return (
    <g>
      {/* soft light pool on the floor in front of an active desk */}
      {lit && (
        <ellipse
          cx={at(x0 + w / 2, y0 + d + 0.8).x}
          cy={at(x0 + w / 2, y0 + d + 0.8).y}
          rx="54"
          ry="20"
          fill={screen}
          opacity="0.09"
        />
      )}
      <Box x={x0} y={y0} w={w} d={d} h={h} />
      {/* monitor stand + screen (faces the viewer) */}
      <polyline
        points={poly([sx + sw / 2, sy, h], [sx + sw / 2, sy, h + 0.25])}
        stroke="var(--office-desk-left)"
        strokeWidth="2"
      />
      <polygon
        points={poly(
          [sx - 0.06, sy, h + 0.18],
          [sx + sw + 0.06, sy, h + 0.18],
          [sx + sw + 0.06, sy, h + 1.32],
          [sx - 0.06, sy, h + 1.32],
        )}
        fill="#07090c"
      />
      <polygon
        points={poly([sx, sy, h + 0.24], [sx + sw, sy, h + 0.24], [sx + sw, sy, h + 1.26], [sx, sy, h + 1.26])}
        fill={screen}
        opacity={lit ? 0.85 : 1}
        className={pose === 'working' ? 'office-screen-on' : undefined}
      />
      {pose === 'working' &&
        [0.45, 0.65, 0.85, 1.05].map((z, i) => (
          <polyline
            key={z}
            points={poly([sx + 0.25, sy, h + z], [sx + 0.25 + (i % 2 ? 0.9 : 1.35), sy, h + z])}
            stroke="#ffffff"
            strokeOpacity="0.55"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        ))}
      {/* keyboard */}
      <polygon
        points={poly(
          [sx + 0.4, y0 + 1.05, h + 0.01],
          [sx + 1.6, y0 + 1.05, h + 0.01],
          [sx + 1.6, y0 + 1.35, h + 0.01],
          [sx + 0.4, y0 + 1.35, h + 0.01],
        )}
        fill="var(--office-desk-left)"
      />
      {/* desk lamp: off when nobody works here */}
      <circle
        cx={at(x0 + w - 0.35, y0 + 0.35, h + 0.9).x}
        cy={at(x0 + w - 0.35, y0 + 0.35, h + 0.9).y}
        r="2.6"
        fill={lit ? 'var(--color-gold-soft)' : 'var(--office-desk-left)'}
      />
      {/* chair */}
      <Box
        x={x0 + w / 2 - 0.25}
        y={y0 + d + 0.75}
        w={0.9}
        d={0.8}
        h={0.42}
        top="var(--office-desk-right)"
        left="var(--office-desk-left)"
        right="var(--office-desk-left)"
      />
      {seated && <Presence agent={agent} cx={seat.x} cy={seat.y - 14} />}
    </g>
  );
}

/** The agent's presence marker: monogram disc with a state ring (spinning while working). */
function Presence({ agent, cx, cy }: { agent: OfficeAgent; cx: number; cy: number }) {
  const color = POSE_COLOR[agent.pose];
  const r = 13;
  return (
    <g>
      <ellipse cx={cx} cy={cy + 22} rx="11" ry="4" fill="#000" opacity="0.28" />
      <circle cx={cx} cy={cy} r={r + 4} fill={color} opacity="0.12" />
      <circle cx={cx} cy={cy} r={r} fill="var(--color-raised)" stroke="var(--color-line-strong)" />
      <circle
        cx={cx}
        cy={cy}
        r={r + 2.5}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeDasharray={agent.pose === 'working' ? '12 6' : undefined}
        className={agent.pose === 'working' ? 'office-ring' : agent.pose === 'error' ? 'office-alert' : undefined}
      />
      <text
        x={cx}
        y={cy + 3.6}
        textAnchor="middle"
        fontSize="10"
        fontWeight="650"
        letterSpacing="0.04em"
        fill="var(--color-paper)"
      >
        {t.office.initials[agent.key] ?? agent.name.slice(0, 2).toUpperCase()}
      </text>
      {agent.pose === 'error' && (
        <g className="office-alert">
          <circle cx={cx + 12} cy={cy - 11} r="6" fill="var(--color-bad)" />
          <text x={cx + 12} y={cy - 8} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">
            !
          </text>
        </g>
      )}
    </g>
  );
}

function Lounge({ agents }: { agents: OfficeAgent[] }) {
  if (!agents.length) return null;
  return (
    <g>
      <Box x={6.4} y={5.3} w={2.8} d={1} h={0.45} top="var(--office-desk-right)" />
      <Box x={6.4} y={5.3} w={2.8} d={0.3} h={0.9} top="var(--office-desk-top)" />
      {agents.slice(0, 2).map((a, i) => {
        const c = at(7.1 + i * 1.3, 5.9, 1.2);
        return <Presence key={a.key} agent={a} cx={c.x} cy={c.y - 6} />;
      })}
    </g>
  );
}

function HqScene({ agents, workerHealthy }: { agents: OfficeAgent[]; workerHealthy: boolean | null }) {
  // Wall display on the back-right wall: one bar per agent, coloured by its real state.
  const x0 = 1;
  const x1 = 5.4;
  return (
    <g>
      <polygon
        points={poly([x0 - 0.1, 0.05, 0.75], [x1 + 0.1, 0.05, 0.75], [x1 + 0.1, 0.05, 2.75], [x0 - 0.1, 0.05, 2.75])}
        fill="#07090c"
      />
      <polygon
        points={poly([x0, 0.05, 0.85], [x1, 0.05, 0.85], [x1, 0.05, 2.65], [x0, 0.05, 2.65])}
        fill="var(--color-navy)"
      />
      {agents.map((a, i) => {
        const bx = x0 + 0.35 + i * 0.72;
        const height = a.pose === 'working' ? 1.45 : a.pose === 'idle' ? 1 : a.pose === 'error' ? 1.2 : 0.35;
        return (
          <polygon
            key={a.key}
            points={poly(
              [bx, 0.05, 1.05],
              [bx + 0.4, 0.05, 1.05],
              [bx + 0.4, 0.05, 1.05 + height],
              [bx, 0.05, 1.05 + height],
            )}
            fill={POSE_COLOR[a.pose]}
            opacity={a.pose === 'absent' || a.pose === 'off_hours' ? 0.35 : 0.9}
            className={a.pose === 'working' ? 'office-screen-on' : undefined}
          />
        );
      })}
      {/* conference table */}
      <Box x={2.2} y={2.8} w={4.6} d={2} h={0.7} />
      {[2.9, 4.5, 6.1].map((x) => (
        <Box key={`a${x}`} x={x - 0.3} y={5.15} w={0.7} d={0.6} h={0.38} top="var(--office-desk-right)" />
      ))}
      {/* server rack: the cron worker */}
      <Box x={8.3} y={0.6} w={1.2} d={1.1} h={2.6} top="var(--office-desk-right)" />
      {[0.7, 1.2, 1.7, 2.2].map((z, i) => {
        const c = at(8.75, 1.7, z);
        const ok = workerHealthy !== false;
        return (
          <circle
            key={z}
            cx={c.x}
            cy={c.y}
            r="1.8"
            fill={workerHealthy === null ? 'var(--color-faint)' : ok ? 'var(--color-ok)' : 'var(--color-bad)'}
            className={ok && i % 2 === 0 ? 'office-screen-on' : !ok ? 'office-alert' : undefined}
          />
        );
      })}
    </g>
  );
}
