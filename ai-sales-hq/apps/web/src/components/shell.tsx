'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { ThemeToggle } from '@/components/theme';
import { Alert, Brand, BrandMark, Spinner } from '@/components/ui';
import { api, type Me } from '@/lib/api';
import { useSession } from '@/lib/session';
import { t } from '@/lib/strings';

type Group = 'main' | 'sales' | 'data' | 'system';

// `phone: false` items live under "Ko'proq" on phones (the bottom bar holds five).
const NAV: {
  href: string;
  label: string;
  short?: string;
  icon: IconName;
  group: Group;
  permission?: string;
  phone?: boolean;
}[] = [
  { href: '/', label: t.nav.home, icon: 'home', group: 'main' },
  { href: '/agents/', label: t.nav.agents, icon: 'agents', group: 'main', permission: 'agents.view', phone: false },
  { href: '/prospects/', label: t.nav.prospects, icon: 'store', group: 'sales', permission: 'prospects.view' },
  { href: '/outreach/', label: t.nav.outreach, icon: 'send', group: 'sales', permission: 'prospects.view' },
  { href: '/orders/', label: t.nav.orders, icon: 'box', group: 'sales', permission: 'orders.view' },
  { href: '/catalog/', label: t.nav.catalog, icon: 'catalog', group: 'data', phone: false },
  {
    href: '/discovery/',
    label: t.nav.discovery,
    icon: 'search',
    group: 'data',
    permission: 'prospects.view',
    phone: false,
  },
  { href: '/site/', label: t.nav.site, icon: 'globe', group: 'data', permission: 'integrations.manage', phone: false },
  {
    href: '/integrations/',
    label: t.nav.integrations,
    icon: 'plug',
    group: 'system',
    permission: 'integrations.manage',
    phone: false,
  },
  {
    href: '/notifications/',
    label: t.nav.notifications,
    short: t.nav.notificationsShort,
    icon: 'bell',
    group: 'system',
    phone: false,
  },
  { href: '/more/', label: t.nav.more, icon: 'grid', group: 'system' },
];

const GROUPS: Group[] = ['main', 'sales', 'data', 'system'];

export function navItems(permissions: string[]) {
  return NAV.filter((n) => !n.permission || permissions.includes(n.permission));
}

export function navGroups(permissions: string[]) {
  const items = navItems(permissions).filter((n) => n.href !== '/more/');
  return GROUPS.map((g) => ({ group: g, label: t.navGroups[g], items: items.filter((n) => n.group === g) })).filter(
    (g) => g.items.length,
  );
}

/**
 * Authenticated page frame: a grouped sidebar on desktop, a glass top bar and five-item tab bar
 * on phones. `actions` sit next to the page title.
 */
export function AppShell({
  title,
  subtitle,
  actions,
  back,
  children,
}: {
  title: string;
  subtitle?: ReactNode | ((me: Me) => ReactNode);
  actions?: ReactNode;
  back?: { href: string; label: string };
  children: (me: Me) => ReactNode;
}) {
  const router = useRouter();
  const path = usePathname();
  const { me, error } = useSession();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!me) return;
    const load = () =>
      api<{ unread: number }>('/notifications')
        .then((n) => setUnread(n.unread))
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [me]);

  if (error)
    return (
      <main className="p-6">
        <Alert kind="error">{error}</Alert>
      </main>
    );
  if (!me) return <Spinner />;
  const groups = navGroups(me.permissions);
  const phone = navItems(me.permissions).filter((n) => n.phone !== false);
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  const logout = () => api('/auth/logout', { method: 'POST' }).finally(() => router.replace('/login/'));

  return (
    <div className="min-h-dvh lg:pl-[264px]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[264px] flex-col border-r border-line bg-graphite/70 backdrop-blur lg:flex">
        <div className="px-5 pt-6 pb-5">
          <Brand />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Asosiy menyu">
          {groups.map((g) => (
            <div key={g.group} className="mb-5">
              <div className="eyebrow mb-1.5 px-3">{g.label}</div>
              <ul className="grid gap-0.5">
                {g.items.map((n) => (
                  <li key={n.href}>
                    <SideLink {...n} active={active(n.href)} badge={n.href === '/notifications/' ? unread : 0} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <Avatar name={me.user.displayName} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium">{me.user.displayName}</div>
              <div className="text-xs text-mist">{t.roles[me.user.role] ?? me.user.role}</div>
            </div>
            <ThemeToggle labels={t.theme} />
            <IconButton label={t.home.logout} icon="logout" onClick={logout} />
          </div>
        </div>
      </aside>

      {/* Phone top bar */}
      <header className="glass sticky top-0 z-20 border-b border-line lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label={t.nav.home}>
            <BrandMark size={30} />
            <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{t.appName}</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <ThemeToggle labels={t.theme} />
            <IconButton label={t.home.logout} icon="logout" onClick={logout} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 lg:mb-8">
          <div className="min-w-0">
            {back && (
              <Link
                href={back.href}
                className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-mist transition-colors hover:text-paper"
              >
                <Icon name="chevron" size={14} className="rotate-180" />
                {back.label}
              </Link>
            )}
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] sm:text-[30px]">{title}</h1>
            {subtitle && (
              <div className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-mist">
                {typeof subtitle === 'function' ? subtitle(me) : subtitle}
              </div>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children(me)}
      </main>

      {/* Phone tab bar */}
      <nav
        className="glass fixed inset-x-0 bottom-0 z-20 grid border-t border-line pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ gridTemplateColumns: `repeat(${phone.length}, minmax(0, 1fr))` }}
        aria-label="Asosiy menyu"
      >
        {phone.map((n) => {
          const on = active(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={on ? 'page' : undefined}
              className={`relative flex min-h-[58px] flex-col items-center justify-center gap-1 text-[10.5px] font-medium tracking-[0.01em] ${on ? 'text-paper' : 'text-faint'}`}
            >
              {on && <span className="absolute top-0 h-[2px] w-8 rounded-full bg-gold" />}
              <span className={on ? 'text-gold' : undefined}>
                <Icon name={n.icon} size={21} />
              </span>
              {n.short ?? n.label}
              {n.href === '/more/' && unread > 0 && <Badge n={unread} className="absolute top-1.5 right-[26%]" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function SideLink({
  href,
  label,
  icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: IconName;
  active: boolean;
  badge: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors ${
        active ? 'bg-panel font-medium text-paper' : 'text-mist hover:bg-panel/60 hover:text-paper'
      }`}
    >
      {active && <span className="-translate-y-1/2 absolute top-1/2 left-0 h-5 w-[3px] rounded-r bg-gold" />}
      <span className={active ? 'text-gold' : 'text-faint group-hover:text-mist'}>
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge > 0 && <Badge n={badge} />}
    </Link>
  );
}

function IconButton({ label, icon, onClick }: { label: string; icon: IconName; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-lg text-mist transition-colors hover:bg-panel hover:text-paper"
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?';
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full border border-gold/30 bg-gradient-to-b from-raised to-panel text-[12px] font-semibold text-gold"
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

function Badge({ n, className = '' }: { n: number; className?: string }) {
  return (
    <span
      className={`grid h-[18px] min-w-[18px] place-items-center rounded-full bg-gold px-1 text-[10px] font-semibold text-[#16120a] tabular-nums ${className}`}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  // Default padding unless the caller sets its own (p-0, p-4 …).
  const pad = /(^|\s)p-\d/.test(className) ? '' : 'p-5';
  return <section className={`surface rounded-2xl border border-line ${pad} ${className}`}>{children}</section>;
}

/** Card title row: a quiet heading with an optional link or control on the right. */
export function CardHeader({ title, hint, action }: { title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-mist">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'muted' | 'gold'; children: ReactNode }) {
  const color = {
    ok: 'bg-ok/10 text-ok ring-ok/25',
    warn: 'bg-warn/10 text-warn ring-warn/25',
    bad: 'bg-bad/10 text-bad ring-bad/25',
    muted: 'bg-panel text-mist ring-line',
    gold: 'bg-gold/10 text-gold ring-gold/25',
  }[tone];
  const dot = {
    ok: 'bg-ok',
    warn: 'bg-warn',
    bad: 'bg-bad',
    muted: 'bg-faint',
    gold: 'bg-gold',
  }[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-medium ring-1 ring-inset ${color}`}
    >
      <span className={`size-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}
