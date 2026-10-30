'use client';

import Link from 'next/link';
import { Icon } from '@/components/icons';
import { AppShell, navGroups } from '@/components/shell';
import { t } from '@/lib/strings';

/** Phone-only overflow menu for pages that do not fit the five-item bottom bar. */
export default function MorePage() {
  return (
    <AppShell title={t.more.title}>
      {(me) => (
        <div className="grid gap-6">
          {navGroups(me.permissions).map((g) => (
            <section key={g.group}>
              <h2 className="eyebrow mb-2 px-1">{g.label}</h2>
              <ul className="surface divide-y divide-line overflow-hidden rounded-2xl border border-line">
                {g.items.map((n) => (
                  <li key={n.href}>
                    <Link href={n.href} className="flex min-h-14 items-center gap-3.5 px-4 hover:bg-panel">
                      <span className="grid size-9 place-items-center rounded-lg border border-line bg-panel text-gold">
                        <Icon name={n.icon} size={18} />
                      </span>
                      <span className="flex-1 text-[15px]">{n.label}</span>
                      <Icon name="chevron" size={16} className="text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
