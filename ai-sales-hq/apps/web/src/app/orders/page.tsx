'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell, Card, Pill } from '@/components/shell';
import { Alert } from '@/components/ui';
import { api } from '@/lib/api';
import { som, when } from '@/lib/format';
import { ORDER_FILTERS, ORDER_TONE, type OrderRow } from '@/lib/orders';
import { t } from '@/lib/strings';

export default function OrdersPage() {
  return (
    <AppShell title={t.orders.title} subtitle={t.orders.intro}>
      {() => <Orders />}
    </AppShell>
  );
}

function Orders() {
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    api<{ orders: OrderRow[] }>(`/orders${status ? `?status=${status}` : ''}`)
      .then((r) => setRows(r.orders))
      .catch((e: Error) => setError(e.message));
  }, [status]);

  return (
    <div className="grid gap-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {ORDER_FILTERS.map((s) => (
          <button
            key={s || 'all'}
            type="button"
            onClick={() => setStatus(s)}
            aria-pressed={status === s}
            className={`btn shrink-0 ${status === s ? 'btn-tab-on' : 'btn-secondary text-mist'}`}
          >
            {s ? t.orders.status[s] : t.orders.all}
          </button>
        ))}
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {rows && rows.length === 0 && <Alert kind="info">{t.orders.empty}</Alert>}
      <ul className="grid gap-2">
        {rows?.map((o) => (
          <li key={o.id}>
            <Link href={`/orders/view/?id=${o.id}`} className="block">
              <Card className="hover:border-line-strong">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{o.prospectName}</div>
                    <div className="text-xs text-mist">
                      {o.number} · {when(o.createdAt)} · {o.itemCount} ta qator
                    </div>
                  </div>
                  <Pill tone={ORDER_TONE[o.status] ?? 'muted'}>{t.orders.status[o.status]}</Pill>
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="tabular-nums">{som(o.totalSom)}</span>
                  <span className="text-mist">{t.orders.payment[o.paymentStatus]}</span>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
