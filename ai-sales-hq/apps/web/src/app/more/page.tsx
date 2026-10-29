'use client';

import Link from 'next/link';
import { Icon } from '@/components/icons';
import { AppShell, navItems } from '@/components/shell';
import { t } from '@/lib/strings';

/** Phone-only overflow menu for pages that do not fit the five-item bottom bar. */
export default function MorePage() {
  return (
    <AppShell title={t.more.title}>
      {(me) => (
        <ul className="grid gap-2">
          {navItems(me.permissions)
            .filter((n) => n.href !== '/more/')
            .map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  className="flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-graphite px-4 hover:border-gold/50"
                >
                  <Icon name={n.icon} />
                  {n.label}
                </Link>
              </li>
            ))}
        </ul>
      )}
    </AppShell>
  );
}
