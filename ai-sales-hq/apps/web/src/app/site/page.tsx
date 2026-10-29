'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppShell, Card } from '@/components/shell';
import { Alert, Button } from '@/components/ui';
import { api } from '@/lib/api';
import { som, when } from '@/lib/format';
import { t } from '@/lib/strings';

interface Overview {
  readAt: string;
  sourceUpdatedAt: string | null;
  products: { total: number; withShopPrice: number; outOfStock: number };
  stores: { total: number; withoutLocation: number };
  storeOwners: {
    approved: number;
    pending: number;
    rejected: number;
    pendingList: { id: string; storeName: string }[];
  };
  customers: number;
  orders: {
    total: number;
    today: number;
    new: number;
    byStatus: Record<string, number>;
    storeOrders: number;
    personalOrders: number;
    recentStoreOrders: {
      id: string;
      date: string | null;
      storeName: string;
      totalSom: number;
      status: string | null;
    }[];
  };
  debts: { totalSom: number; stores: number; top: { storeId: string; name: string; debtSom: number }[] };
}

export default function SitePage() {
  return <AppShell title={t.site.title}>{() => <Site />}</AppShell>;
}

function Site() {
  const [o, setO] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setO(await api<Overview>('/integrations/firestore/overview'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid gap-4">
      <p className="text-sm text-mist">{t.site.intro}</p>
      {error && (
        <Alert kind="error">
          {error}{' '}
          <Link href="/integrations/" className="underline">
            {t.site.toIntegrations}
          </Link>
        </Alert>
      )}
      {o && (
        <>
          <p className="text-xs text-mist">{t.site.readAt(when(o.readAt), when(o.sourceUpdatedAt))}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label={t.site.newOrders} value={o.orders.new} hint={t.site.today(o.orders.today)} />
            <Tile
              label={t.site.pendingOwners}
              value={o.storeOwners.pending}
              hint={t.site.approved(o.storeOwners.approved)}
            />
            <Tile label={t.site.storeDebt} value={som(o.debts.totalSom)} hint={t.site.debtStores(o.debts.stores)} />
            <Tile
              label={t.site.products}
              value={o.products.total}
              hint={t.site.shopPrices(o.products.withShopPrice, o.products.outOfStock)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-semibold">{t.site.recentStoreOrders}</h2>
              <ul className="grid gap-2 text-sm">
                {o.orders.recentStoreOrders.map((r) => (
                  <li
                    key={r.id}
                    className="flex justify-between gap-2 border-t border-line pt-2 first:border-0 first:pt-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{r.storeName}</span>
                      <span className="text-xs text-mist">
                        {r.date ?? '—'} · {t.site.status[r.status ?? ''] ?? r.status ?? '—'}
                      </span>
                    </span>
                    <span className="tabular-nums">{som(r.totalSom)}</span>
                  </li>
                ))}
                {o.orders.recentStoreOrders.length === 0 && <li className="text-mist">—</li>}
              </ul>
              <p className="mt-3 text-xs text-mist">
                {t.site.orderSplit(o.orders.total, o.orders.storeOrders, o.orders.personalOrders)}
              </p>
            </Card>

            <Card>
              <h2 className="mb-3 font-semibold">{t.site.debts}</h2>
              <ul className="grid gap-1 text-sm">
                {o.debts.top.map((d) => (
                  <li key={d.storeId} className="flex justify-between gap-2">
                    <span className="truncate">{d.name}</span>
                    <span className="tabular-nums text-warn">{som(d.debtSom)}</span>
                  </li>
                ))}
                {o.debts.top.length === 0 && <li className="text-mist">{t.site.noDebts}</li>}
              </ul>
            </Card>

            <Card>
              <h2 className="mb-3 font-semibold">{t.site.owners}</h2>
              <ul className="grid gap-1 text-sm">
                {o.storeOwners.pendingList.map((p) => (
                  <li key={p.id}>{p.storeName}</li>
                ))}
                {o.storeOwners.pendingList.length === 0 && <li className="text-mist">{t.site.noPending}</li>}
              </ul>
              <p className="mt-3 text-xs text-mist">{t.site.ownersHint}</p>
            </Card>

            <Card>
              <h2 className="mb-3 font-semibold">{t.site.storesTitle}</h2>
              <dl className="grid gap-1 text-sm">
                <Row k={t.site.storesTotal} v={o.stores.total} />
                <Row k={t.site.noLocation} v={o.stores.withoutLocation} />
                <Row k={t.site.customers} v={o.customers} />
              </dl>
              <Link href="/discovery/" className="mt-3 inline-block text-sm text-gold">
                {t.site.toDiscovery}
              </Link>
            </Card>
          </div>
        </>
      )}
      <Button variant="ghost" onClick={() => void load()} disabled={busy}>
        {busy ? t.site.loading : t.site.refresh}
      </Button>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <Card>
      <div className="text-xs text-mist">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-mist">{hint}</div>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-mist">{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
