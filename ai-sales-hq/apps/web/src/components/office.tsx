'use client';

import Link from 'next/link';
import { t } from '@/lib/strings';

export interface OfficeAgent {
  key: string;
  name: string;
  room: string;
  state: string;
  pose: 'working' | 'idle' | 'off_hours' | 'paused' | 'stopping' | 'error' | 'absent';
  currentJobType: string | null;
}

const ROOMS = ['hq', 'director', 'research', 'sales', 'communication', 'orders'] as const;

const POSE_COLOR: Record<OfficeAgent['pose'], string> = {
  working: 'var(--color-ok)',
  idle: 'var(--color-gold)',
  off_hours: 'var(--color-mist)',
  paused: 'var(--color-warn)',
  stopping: 'var(--color-warn)',
  error: 'var(--color-bad)',
  absent: 'var(--color-mist)',
};

/**
 * 2D virtual office (A13): plain SVG + CSS, one small scene per room so it stays legible on a
 * phone. Every figure is derived from persisted state by the server (`pose`), never simulated.
 */
export function Office({ agents, workerHealthy }: { agents: OfficeAgent[]; workerHealthy: boolean | null }) {
  const running = agents.filter((a) => a.state === 'RUNNING').length;
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ROOMS.map((room) => {
        const inRoom = agents.filter((a) => a.room === room);
        const label = t.office.rooms[room] ?? room;
        const href = room === 'hq' ? '/' : `/agents/#${inRoom[0]?.key ?? ''}`;
        const description =
          room === 'hq'
            ? t.office.hqSummary(running, agents.length)
            : inRoom.map((a) => `${a.name}: ${t.office.pose[a.pose]}`).join('; ') || t.office.empty;
        return (
          <li key={room} className="min-w-0">
            <Link
              href={href}
              aria-label={`${label}. ${description}`}
              className="group block overflow-hidden rounded-2xl border border-line bg-graphite transition-colors hover:border-gold/50"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <svg viewBox="0 0 320 170" className="block w-full" role="presentation">
                <RoomShell />
                {room === 'hq' ? (
                  <HqScene running={running} total={agents.length} workerHealthy={workerHealthy} />
                ) : (
                  inRoom.map((a, i) => <Desk key={a.key} agent={a} x={inRoom.length === 1 ? 110 : 40 + i * 150} />)
                )}
                {room !== 'hq' && <Lounge agents={inRoom.filter((a) => a.pose === 'paused')} />}
              </svg>
              <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5">
                <span className="shrink-0 whitespace-nowrap text-sm font-medium">{label}</span>
                <span className="min-w-0 truncate text-xs text-mist">{description}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function RoomShell() {
  return (
    <g>
      <rect x="0" y="0" width="320" height="170" fill="var(--office-floor)" />
      {/* back wall with a soft perspective band */}
      <rect x="0" y="0" width="320" height="46" fill="var(--office-wall)" opacity="0.55" />
      <rect x="0" y="46" width="320" height="2" fill="var(--color-gold)" opacity="0.25" />
      {/* window */}
      <rect x="236" y="10" width="60" height="26" rx="3" fill="var(--color-navy)" stroke="var(--color-line)" />
      <line x1="266" y1="10" x2="266" y2="36" stroke="var(--color-line)" />
      {/* floor grid */}
      {[70, 100, 130].map((y) => (
        <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="var(--color-line)" strokeOpacity="0.35" />
      ))}
    </g>
  );
}

function Desk({ agent, x }: { agent: OfficeAgent; x: number }) {
  const atDesk =
    agent.pose === 'working' || agent.pose === 'idle' || agent.pose === 'stopping' || agent.pose === 'error';
  const screenOn = agent.pose === 'working';
  const color = POSE_COLOR[agent.pose];
  return (
    <g transform={`translate(${x} 0)`}>
      {/* chair */}
      <rect x="34" y="104" width="32" height="26" rx="8" fill="var(--office-desk)" opacity="0.8" />
      {/* person (drawn behind the desk top) */}
      {atDesk && (
        <g className={agent.pose === 'working' ? 'office-typing' : undefined}>
          <circle cx="50" cy="56" r="10" fill={color} />
          <rect x="34" y="68" width="32" height="40" rx="11" fill={color} opacity="0.85" />
        </g>
      )}
      {/* desk */}
      <rect x="0" y="108" width="100" height="12" rx="3" fill="var(--office-desk)" stroke="var(--color-line)" />
      <rect x="6" y="120" width="6" height="22" fill="var(--office-desk)" />
      <rect x="88" y="120" width="6" height="22" fill="var(--office-desk)" />
      {/* monitor */}
      <rect x="30" y="80" width="40" height="26" rx="3" fill="var(--color-ink)" stroke="var(--color-line)" />
      <rect
        x="33"
        y="83"
        width="34"
        height="20"
        rx="2"
        fill={screenOn ? 'var(--color-gold)' : agent.pose === 'idle' ? 'var(--color-navy)' : 'var(--color-panel)'}
        opacity={screenOn ? 0.75 : 1}
        className={screenOn ? 'office-screen-on' : undefined}
      />
      <rect x="46" y="106" width="8" height="3" fill="var(--color-line)" />
      {/* lamp: off outside working hours */}
      <circle
        cx="90"
        cy="98"
        r="4"
        fill={agent.pose === 'off_hours' || agent.pose === 'absent' ? 'var(--color-line)' : 'var(--color-gold-soft)'}
      />
      {agent.pose === 'error' && (
        <g className="office-alert">
          <circle cx="78" cy="50" r="9" fill="var(--color-bad)" />
          <text x="78" y="54.5" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">
            !
          </text>
        </g>
      )}
      {agent.pose === 'off_hours' && (
        <text x="50" y="66" textAnchor="middle" fontSize="14" fill="var(--color-mist)">
          ☾
        </text>
      )}
      <text x="50" y="161" textAnchor="middle" fontSize="13" fill="var(--color-paper)">
        {agent.name}
      </text>
    </g>
  );
}

function Lounge({ agents }: { agents: OfficeAgent[] }) {
  if (!agents.length) return null;
  return (
    <g>
      <rect x="250" y="120" width="60" height="18" rx="8" fill="var(--color-warn)" opacity="0.25" />
      {agents.map((a, i) => (
        <circle key={a.key} cx={265 + i * 18} cy="114" r="7" fill="var(--color-warn)" />
      ))}
    </g>
  );
}

function HqScene({ running, total, workerHealthy }: { running: number; total: number; workerHealthy: boolean | null }) {
  return (
    <g>
      {/* reception desk with the agent board */}
      <rect x="40" y="96" width="240" height="18" rx="4" fill="var(--office-desk)" stroke="var(--color-line)" />
      <rect
        x="70"
        y="58"
        width="180"
        height="34"
        rx="4"
        fill="var(--color-ink)"
        stroke="var(--color-gold)"
        strokeOpacity="0.4"
      />
      {Array.from({ length: total }, (_, i) => (
        <circle
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed number of indicator dots
          key={i}
          cx={95 + i * 26}
          cy="75"
          r="7"
          fill={i < running ? 'var(--color-ok)' : 'var(--color-line)'}
        />
      ))}
      {workerHealthy !== null && (
        <g>
          <circle
            cx="56"
            cy="140"
            r="5"
            fill={workerHealthy ? 'var(--color-ok)' : 'var(--color-bad)'}
            className={workerHealthy ? undefined : 'office-alert'}
          />
          <text x="68" y="144.5" fontSize="13" fill="var(--color-mist)">
            {workerHealthy ? t.office.workerOk : t.office.workerBad}
          </text>
        </g>
      )}
    </g>
  );
}
