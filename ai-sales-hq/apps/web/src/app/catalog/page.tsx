'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell, Card, Pill } from '@/components/shell';
import { Alert, Button } from '@/components/ui';
import { api, type Me } from '@/lib/api';
import { grams, som } from '@/lib/format';
import { t } from '@/lib/strings';

interface Price {
  id: string;
  amount: number;
  status: 'OWNER_UNCONFIRMED' | 'CONFIRMED' | 'SUPERSEDED';
  source: string;
}
interface Product {
  id: string;
  source: string;
  name: string;
  categoryName: string | null;
  packageWeightGrams: number | null;
  availability: string;
  stockReported: number | null;
  isActive: boolean;
  retail: Price | null;
  wholesale: Price | null;
}

export default function CatalogPage() {
  return (
    <AppShell title={t.catalog.title} subtitle={t.catalog.intro}>
      {(me) => <Catalog me={me} />}
    </AppShell>
  );
}

function Catalog({ me }: { me: Me }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = me.permissions.includes('prices.confirm');

  const load = useCallback(async () => {
    try {
      const res = await api<{ products: Product[] }>(`/catalog/products${showInactive ? '?inactive=1' : ''}`);
      setProducts(res.products);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [showInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}
      <label className="mb-4 flex items-center gap-2 text-sm text-mist">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="size-4 accent-[var(--color-gold)]"
        />
        {t.catalog.showInactive}
      </label>
      {products?.length === 0 && (
        <Card>
          <p className="mb-3">{t.catalog.empty}</p>
          {canEdit && (
            <>
              <p className="mb-3 text-sm text-mist">{t.catalog.seedHint}</p>
              <Button onClick={() => act(() => api('/catalog/seed', { method: 'POST' }))}>{t.catalog.seed}</Button>
            </>
          )}
        </Card>
      )}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
        {products?.map((p) => (
          <li key={p.id} className="min-w-0">
            <ProductCard p={p} canEdit={canEdit} act={act} />
          </li>
        ))}
      </ul>
    </>
  );
}

function ProductCard({
  p,
  canEdit,
  act,
}: {
  p: Product;
  canEdit: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const setPrice = (type: 'RETAIL' | 'WHOLESALE') => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const amount = Number(new FormData(form).get('amount'));
    form.reset();
    void act(() => api(`/catalog/products/${p.id}/price`, { method: 'POST', body: { type, amount } }));
  };
  return (
    <Card className={p.isActive ? '' : 'opacity-60'}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">
            {p.name} <span className="text-mist">{grams(p.packageWeightGrams)}</span>
          </h2>
          <p className="text-xs text-mist">
            {[p.categoryName, t.catalog.source[p.source]].filter(Boolean).join(' · ')}
          </p>
        </div>
        {!p.isActive && <Pill tone="muted">{t.catalog.inactive}</Pill>}
      </div>
      <p className="mb-3 text-xs text-mist">
        {t.catalog.availability[p.availability]}
        {p.stockReported !== null && ` · ${t.catalog.stockReported(p.stockReported)}`}
      </p>
      <PriceRow label={t.catalog.retail} price={p.retail} canEdit={canEdit} act={act} />
      {canEdit && p.source !== 'FIRESTORE' && <PriceForm onSubmit={setPrice('RETAIL')} label={t.catalog.setRetail} />}
      <PriceRow label={t.catalog.wholesale} price={p.wholesale} canEdit={canEdit} act={act} />
      {canEdit && <PriceForm onSubmit={setPrice('WHOLESALE')} label={t.catalog.setWholesale} />}
    </Card>
  );
}

function PriceRow({
  label,
  price,
  canEdit,
  act,
}: {
  label: string;
  price: Price | null;
  canEdit: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line py-2">
      <span className="text-sm text-mist">{label}</span>
      {price ? (
        <span className="flex items-center gap-2">
          <b className="tabular-nums">{som(price.amount)}</b>
          {price.status === 'CONFIRMED' ? (
            <Pill tone="ok">{t.catalog.confirmed}</Pill>
          ) : canEdit ? (
            <button
              type="button"
              className="rounded-full bg-gold/10 px-2.5 py-0.5 text-xs font-medium text-gold ring-1 ring-gold/25 ring-inset hover:bg-gold/15"
              onClick={() => act(() => api(`/catalog/prices/${price.id}/confirm`, { method: 'POST' }))}
            >
              {t.catalog.confirm}
            </button>
          ) : (
            <Pill tone="warn">{t.catalog.unconfirmed}</Pill>
          )}
        </span>
      ) : (
        <span className="text-sm text-mist">{t.catalog.noWholesale}</span>
      )}
    </div>
  );
}

function PriceForm({ onSubmit, label }: { onSubmit: (e: FormEvent<HTMLFormElement>) => void; label: string }) {
  return (
    <form onSubmit={onSubmit} className="mb-2 flex gap-2">
      <input
        name="amount"
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        required
        placeholder={t.catalog.amountPlaceholder}
        aria-label={label}
        className="input min-w-0 flex-1"
      />
      <button type="submit" aria-label={label} className="btn btn-secondary shrink-0 text-xs">
        {t.agents.save}
      </button>
    </form>
  );
}
