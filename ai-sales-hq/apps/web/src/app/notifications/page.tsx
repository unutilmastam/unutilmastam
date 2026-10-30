'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppShell, Card, Pill } from '@/components/shell';
import { api } from '@/lib/api';
import { when } from '@/lib/format';
import { t } from '@/lib/strings';

interface Item {
  id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  return <AppShell title={t.notifications.title}>{() => <Notifications />}</AppShell>;
}

function Notifications() {
  const [items, setItems] = useState<Item[] | null>(null);
  const load = useCallback(() => api<{ items: Item[] }>('/notifications').then((r) => setItems(r.items)), []);
  useEffect(() => {
    void load();
  }, [load]);

  const read = (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }).then(load);

  if (!items) return null;
  if (!items.length) return <p className="text-mist">{t.notifications.empty}</p>;
  return (
    <div className="grid gap-3">
      <button
        type="button"
        className="justify-self-end text-sm text-gold underline-offset-4 hover:underline"
        onClick={() => api('/notifications/read-all', { method: 'POST' }).then(load)}
      >
        {t.notifications.markAll}
      </button>
      {items.map((n) => (
        <Card key={n.id} className={n.readAt ? 'opacity-60' : ''}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="font-semibold">{n.title}</h2>
            <Pill tone={n.severity === 'CRITICAL' ? 'bad' : n.severity === 'WARNING' ? 'warn' : 'gold'}>
              {when(n.createdAt)}
            </Pill>
          </div>
          <p className="mb-2 text-sm text-mist">{n.body}</p>
          {n.link && (
            <Link href={n.link} onClick={() => void read(n.id)} className="text-sm text-gold">
              {t.notifications.open} →
            </Link>
          )}
        </Card>
      ))}
    </div>
  );
}
