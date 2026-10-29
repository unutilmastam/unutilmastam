'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { ThemeToggle } from '@/components/theme';
import { Alert, Brand, Spinner } from '@/components/ui';
import { api, type Me } from '@/lib/api';
import { useSession } from '@/lib/session';
import { t } from '@/lib/strings';

const NAV: { href: string; label: string; short?: string; icon: IconName; permission?: string }[] = [
  { href: '/', label: t.nav.home, icon: 'home' },
  { href: '/agents/', label: t.nav.agents, icon: 'agents', permission: 'agents.view' },
  { href: '/catalog/', label: t.nav.catalog, icon: 'catalog' },
  { href: '/integrations/', label: t.nav.integrations, icon: 'link', permission: 'integrations.manage' },
  { href: '/notifications/', label: t.nav.notifications, short: t.nav.notificationsShort, icon: 'bell' },
];

/** Authenticated page frame: top bar on desktop, bottom navigation on phones. */
export function AppShell({ title, children }: { title: string; children: (me: Me) => ReactNode }) {
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
  const items = NAV.filter((n) => !n.permission || me.permissions.includes(n.permission));

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="sticky top-0 z-10 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Brand />
          <nav className="hidden gap-1 md:flex" aria-label="Asosiy menyu">
            {items.map((n) => (
              <NavLink key={n.href} {...n} active={path === n.href} badge={n.href === '/notifications/' ? unread : 0} />
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle labels={t.theme} />
            <button
              type="button"
              aria-label={t.home.logout}
              title={t.home.logout}
              className="grid size-10 place-items-center rounded-xl border border-line text-mist hover:border-gold/50 hover:text-paper"
              onClick={() => api('/auth/logout', { method: 'POST' }).finally(() => router.replace('/login/'))}
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="mb-5 text-2xl font-semibold tracking-tight">{title}</h1>
        {children(me)}
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-10 grid border-t border-line bg-graphite/95 backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        aria-label="Asosiy menyu"
      >
        {items.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${path === n.href ? 'text-gold' : 'text-mist'}`}
          >
            <Icon name={n.icon} size={20} />
            {n.short ?? n.label}
            {n.href === '/notifications/' && unread > 0 && (
              <Badge n={unread} className="absolute top-1.5 right-[28%]" />
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function NavLink({ href, label, active, badge }: { href: string; label: string; active: boolean; badge: number }) {
  return (
    <Link
      href={href}
      className={`relative rounded-xl px-3 py-2 text-sm ${active ? 'bg-panel text-gold' : 'text-mist hover:text-paper'}`}
    >
      {label}
      {badge > 0 && <Badge n={badge} className="-top-1 -right-1 absolute" />}
    </Link>
  );
}

function Badge({ n, className = '' }: { n: number; className?: string }) {
  return (
    <span
      className={`grid min-w-5 place-items-center rounded-full bg-gold px-1 text-[10px] font-semibold text-ink ${className}`}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-line bg-graphite p-4 ${className}`}
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      {children}
    </section>
  );
}

export function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'muted' | 'gold'; children: ReactNode }) {
  const color = {
    ok: 'border-ok/40 text-ok',
    warn: 'border-warn/40 text-warn',
    bad: 'border-bad/40 text-bad',
    muted: 'border-line text-mist',
    gold: 'border-gold/40 text-gold',
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${color}`}>{children}</span>
  );
}
