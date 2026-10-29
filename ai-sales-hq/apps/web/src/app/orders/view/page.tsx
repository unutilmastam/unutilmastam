'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useCallback, useEffect, useState } from 'react';
import { AppShell, Card, Pill } from '@/components/shell';
import { Alert, Button } from '@/components/ui';
import { api, type Me } from '@/lib/api';
import { grams, som, when } from '@/lib/format';
import { EDITABLE, ORDER_TONE, type OrderableProduct, type OrderDetail } from '@/lib/orders';
import { t } from '@/lib/strings';

export default function OrderPage() {
  return (
    <AppShell title={t.orders.title}>
      {(me) => (
        <Suspense>
          <Order me={me} />
        </Suspense>
      )}
    </AppShell>
  );
}

const input = 'w-full min-h-10 rounded-xl border border-line bg-ink px-3 text-sm';

function Order({ me }: { me: Me }) {
  const id = useSearchParams().get('id') ?? '';
  const [o, setO] = useState<OrderDetail | null>(null);
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const can = (p: string) => me.permissions.includes(p);

  const load = useCallback(() => api<OrderDetail>(`/orders/${id}`).then(setO), [id]);
  useEffect(() => {
    load().catch((e: Error) => setMsg({ kind: 'error', text: e.message }));
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setMsg(null);
    setBusy(true);
    try {
      await fn();
      if (ok) setMsg({ kind: 'ok', text: ok });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
    await load().catch(() => undefined);
  };

  if (!o) return msg ? <Alert kind={msg.kind}>{msg.text}</Alert> : null;
  const due = o.totalSom - o.amountPaidSom;
  const decide = (decision: string, note?: string) =>
    act(() => api(`/orders/${o.id}/decision`, { method: 'POST', body: { decision, note: note || undefined } }));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid content-start gap-4">
        <Link href="/orders/" className="text-sm text-gold">
          {t.orders.back}
        </Link>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold">
                <Link href={`/prospects/view/?id=${o.prospect.id}`} className="hover:text-gold">
                  {o.prospect.name}
                </Link>
              </h2>
              <p className="text-sm text-mist">
                {o.number} · {when(o.createdAt)}
              </p>
            </div>
            <Pill tone={ORDER_TONE[o.status] ?? 'muted'}>{t.orders.status[o.status]}</Pill>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <Figure label={t.orders.total} value={som(o.totalSom)} />
            <Figure label={t.orders.paidSoFar} value={som(o.amountPaidSom)} />
            <Figure label={t.orders.due} value={som(due)} />
          </dl>
          <p className="mt-2 text-xs text-mist">{t.orders.payment[o.paymentStatus]}</p>
        </Card>

        {o.status === 'PRICE_CHANGED' && <Alert kind="error">{t.orders.priceChanged}</Alert>}

        <Items order={o} canEdit={can('orders.edit')} busy={busy} act={act} />
        <Details order={o} canEdit={can('orders.edit')} act={act} />
      </div>

      <div className="grid content-start gap-4">
        <Actions order={o} can={can} busy={busy} act={act} decide={decide} />
        <Payments order={o} canRecord={can('payments.record')} act={act} />
        <Card>
          <h3 className="mb-2 font-semibold">{t.orders.history}</h3>
          <ol className="grid gap-1 text-sm">
            {o.events.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-x-2">
                <span>{t.orders.status[e.toStatus]}</span>
                <span className="text-xs text-mist">{when(e.createdAt)}</span>
                {e.note && <span className="w-full text-xs text-mist">{e.note}</span>}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line px-2 py-1.5">
      <dt className="text-xs text-mist">{label}</dt>
      <dd className="truncate font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
interface Line {
  key: number;
  productId: string;
  priceType: 'RETAIL' | 'WHOLESALE';
  quantity: number;
}

function Items({ order, canEdit, busy, act }: { order: OrderDetail; canEdit: boolean; busy: boolean; act: Act }) {
  const editable = canEdit && EDITABLE.has(order.status);
  const [products, setProducts] = useState<OrderableProduct[] | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  useEffect(() => {
    if (!editable) return;
    api<{ products: OrderableProduct[] }>('/orders/products')
      .then((r) => setProducts(r.products))
      .catch(() => setProducts([]));
  }, [editable]);
  useEffect(() => {
    setLines(
      order.items.map((i, n) => ({ key: n, productId: i.productId, priceType: i.priceType, quantity: i.quantity })),
    );
  }, [order.items]);

  const label = (p: OrderableProduct) => `${p.name}${p.packageWeightGrams ? ` ${grams(p.packageWeightGrams)}` : ''}`;
  const set = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const typesFor = (p: OrderableProduct | undefined) =>
    (['RETAIL', 'WHOLESALE'] as const).filter((x) => (x === 'RETAIL' ? p?.retailSom : p?.wholesaleSom) != null);
  const addLine = () => {
    const p = products?.[0];
    if (!p) return;
    setLines((ls) => [
      ...ls,
      {
        key: Math.max(0, ...ls.map((l) => l.key)) + 1,
        productId: p.id,
        priceType: typesFor(p)[0] ?? 'RETAIL',
        quantity: 1,
      },
    ]);
  };

  return (
    <Card>
      <h3 className="mb-3 font-semibold">{t.orders.items}</h3>
      <ul className="grid gap-2 text-sm">
        {order.items.map((i) => (
          <li key={i.id} className="border-t border-line pt-2 first:border-0 first:pt-0">
            <div className="flex justify-between gap-2">
              <span>
                {i.productName} {grams(i.packageWeightGrams)} × {i.quantity}
              </span>
              <span className="tabular-nums">{som(i.lineTotalSom)}</span>
            </div>
            <div className="text-xs text-mist">
              {som(i.unitPriceSom)} · {i.priceType === 'WHOLESALE' ? t.orders.wholesale : t.orders.retail} ·{' '}
              {t.orders.priceSource[i.priceSource] ?? i.priceSource}
              {i.priceStale && <span className="text-bad"> · {t.orders.priceStale}</span>}
            </div>
            {i.availability === 'UNKNOWN' && <div className="text-xs text-warn">{t.orders.availabilityUnknown}</div>}
          </li>
        ))}
        {order.items.length === 0 && <li className="text-mist">{t.orders.noItems}</li>}
      </ul>

      {editable && products && (
        <div className="mt-4 grid gap-3 border-t border-line pt-3">
          {products.length === 0 && <Alert kind="info">{t.orders.noProducts}</Alert>}
          {lines.map((l) => {
            const p = products.find((x) => x.id === l.productId);
            return (
              <div
                key={l.key}
                className="grid gap-2 rounded-xl border border-line p-2 sm:grid-cols-[1fr_auto_auto_auto]"
              >
                <select
                  aria-label={t.orders.product}
                  value={l.productId}
                  onChange={(e) => {
                    const np = products.find((x) => x.id === e.target.value);
                    set(l.key, { productId: e.target.value, priceType: typesFor(np)[0] ?? 'RETAIL' });
                  }}
                  className={input}
                >
                  {products.map((x) => (
                    <option key={x.id} value={x.id}>
                      {label(x)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t.orders.priceType}
                  value={l.priceType}
                  onChange={(e) => set(l.key, { priceType: e.target.value as Line['priceType'] })}
                  className={input}
                >
                  {typesFor(p).map((x) => (
                    <option key={x} value={x}>
                      {x === 'RETAIL'
                        ? `${t.orders.retail} ${som(p?.retailSom ?? 0)}`
                        : `${t.orders.wholesale} ${som(p?.wholesaleSom ?? 0)}`}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10000}
                  aria-label={t.orders.quantity}
                  value={l.quantity}
                  onChange={(e) => set(l.key, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                  className={`${input} sm:w-24`}
                />
                <button
                  type="button"
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  className="min-h-10 rounded-xl border border-line px-3 text-sm text-mist hover:border-bad/50"
                >
                  {t.orders.removeLine}
                </button>
              </div>
            );
          })}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="ghost" type="button" onClick={addLine} disabled={!products.length}>
              {t.orders.addLine}
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                act(() =>
                  api(`/orders/${order.id}/items`, {
                    method: 'POST',
                    body: {
                      items: lines.map(({ productId, priceType, quantity }) => ({ productId, priceType, quantity })),
                    },
                  }),
                )
              }
            >
              {t.orders.saveItems}
            </Button>
          </div>
          <p className="text-xs text-mist">{t.orders.serverTotal}</p>
        </div>
      )}
    </Card>
  );
}

function Details({ order, canEdit, act }: { order: OrderDetail; canEdit: boolean; act: Act }) {
  const closed = ['DELIVERED', 'CLOSED', 'CANCELLED', 'REJECTED'].includes(order.status);
  const readOnly = !canEdit || closed;
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? '').trim() || null;
    void act(() =>
      api(`/orders/${order.id}/details`, {
        method: 'POST',
        body: {
          deliveryAddress: s('deliveryAddress'),
          contactPhone: s('contactPhone'),
          contactName: s('contactName'),
          notes: s('notes'),
        },
      }),
    );
  };
  return (
    <Card>
      <h3 className="mb-3 font-semibold">{t.orders.details}</h3>
      <form onSubmit={save} className="grid gap-3 text-sm" key={order.id + order.status}>
        <label>
          <span className="mb-1 block text-mist">{t.orders.address}</span>
          <input
            name="deliveryAddress"
            defaultValue={order.deliveryAddress ?? ''}
            readOnly={readOnly}
            className={input}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-mist">{t.orders.phone}</span>
            <input
              name="contactPhone"
              type="tel"
              defaultValue={order.contactPhone ?? ''}
              readOnly={readOnly}
              className={input}
            />
          </label>
          <label>
            <span className="mb-1 block text-mist">{t.orders.contactName}</span>
            <input name="contactName" defaultValue={order.contactName ?? ''} readOnly={readOnly} className={input} />
          </label>
        </div>
        <label>
          <span className="mb-1 block text-mist">{t.orders.notes}</span>
          <textarea
            name="notes"
            rows={3}
            defaultValue={order.notes ?? ''}
            readOnly={readOnly}
            className="w-full rounded-xl border border-line bg-ink p-3"
          />
        </label>
        {!readOnly && (
          <Button variant="ghost" type="submit">
            {t.orders.saveDetails}
          </Button>
        )}
      </form>
    </Card>
  );
}

function Actions({
  order,
  can,
  busy,
  act,
  decide,
}: {
  order: OrderDetail;
  can: (p: string) => boolean;
  busy: boolean;
  act: Act;
  decide: (d: string, note?: string) => Promise<void>;
}) {
  const [said, setSaid] = useState('');
  const [note, setNote] = useState('');
  const [confirmDelivery, setConfirmDelivery] = useState(false);
  const [copied, setCopied] = useState(false);
  const edit = can('orders.edit');
  const owner = can('orders.approve');
  const s = order.status;

  const small = (label: string, onClick: () => void, tone = '') => (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`min-h-10 rounded-xl border border-line px-3 text-sm hover:border-gold/50 ${tone}`}
    >
      {label}
    </button>
  );

  return (
    <Card>
      {order.missing.length > 0 && EDITABLE.has(s) && (
        <div className="mb-3">
          <h3 className="mb-1 font-semibold">{t.orders.missing}</h3>
          <ul className="list-inside list-disc text-sm text-warn">
            {order.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {(s === 'DRAFT' || s === 'NEEDS_INFORMATION') && edit && (
        <div className="grid gap-2">
          {s === 'NEEDS_INFORMATION' ? (
            <Button onClick={() => decide('resume')} disabled={busy}>
              {t.orders.resume}
            </Button>
          ) : (
            <Button
              onClick={() => act(() => api(`/orders/${order.id}/request-confirmation`, { method: 'POST' }))}
              disabled={busy || order.missing.length > 0}
            >
              {t.orders.requestConfirmation}
            </Button>
          )}
          <div className="flex flex-wrap gap-2">{small(t.orders.cancel, () => decide('cancel'), 'text-bad')}</div>
        </div>
      )}

      {s === 'CUSTOMER_CONFIRMATION_PENDING' && (
        <div className="grid gap-3">
          <h3 className="font-semibold">{t.orders.confirmationTitle}</h3>
          <pre className="whitespace-pre-wrap rounded-xl border border-line bg-ink p-3 font-sans text-sm">
            {order.confirmationText}
          </pre>
          <p className="text-xs text-mist">{t.orders.confirmationHint}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              onClick={async () => {
                await navigator.clipboard?.writeText(order.confirmationText).catch(() => undefined);
                setCopied(true);
              }}
            >
              {copied ? t.orders.copied : t.orders.copy}
            </Button>
            {order.contactPhone && (
              <a
                href={`sms:${order.contactPhone}?body=${encodeURIComponent(order.confirmationText)}`}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 font-medium hover:border-gold/50"
              >
                {t.orders.sms}
              </a>
            )}
          </div>
          {edit && (
            <>
              <label className="text-sm">
                <span className="mb-1 block text-mist">{t.orders.customerSaid}</span>
                <textarea
                  value={said}
                  onChange={(e) => setSaid(e.target.value)}
                  rows={2}
                  maxLength={500}
                  className="w-full rounded-xl border border-line bg-ink p-3"
                />
              </label>
              <Button
                disabled={busy || !said.trim()}
                onClick={() =>
                  act(() =>
                    api(`/orders/${order.id}/customer-confirmed`, { method: 'POST', body: { note: said.trim() } }),
                  )
                }
              >
                {t.orders.customerConfirmed}
              </Button>
              <div className="flex flex-wrap gap-2">
                {small(t.orders.needsInfo, () => decide('needs_info'))}
                {small(t.orders.cancel, () => decide('cancel'), 'text-bad')}
              </div>
            </>
          )}
        </div>
      )}

      {(s === 'READY_FOR_OWNER_REVIEW' || s === 'ON_HOLD') && (
        <div className="grid gap-3">
          <h3 className="font-semibold">{t.orders.review}</h3>
          {order.customerConfirmation && (
            <p className="text-sm text-mist">
              «{order.customerConfirmation}» · {when(order.customerConfirmedAt)}
            </p>
          )}
          {owner ? (
            <>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder={t.orders.note}
                aria-label={t.orders.note}
                className={input}
              />
              {s === 'READY_FOR_OWNER_REVIEW' ? (
                <>
                  <Button disabled={busy} onClick={() => decide('approve', note)}>
                    {t.orders.approve}
                  </Button>
                  <div className="flex flex-wrap gap-2">
                    {small(t.orders.needsInfo, () => decide('needs_info', note))}
                    {small(t.orders.hold, () => decide('hold', note))}
                    {small(t.orders.reject, () => decide('reject', note), 'text-bad')}
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {small(t.orders.resume, () => decide('resume', note))}
                  {small(t.orders.cancel, () => decide('cancel', note), 'text-bad')}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-mist">{t.orders.ownerOnly}</p>
          )}
        </div>
      )}

      {s === 'APPROVED_FOR_DELIVERY' &&
        (can('orders.deliver') ? (
          <div className="grid gap-2">
            {confirmDelivery ? (
              <Button
                disabled={busy}
                onClick={() => act(() => api(`/orders/${order.id}/delivered`, { method: 'POST' }))}
              >
                {t.orders.deliveredConfirm}
              </Button>
            ) : (
              <Button onClick={() => setConfirmDelivery(true)}>{t.orders.delivered}</Button>
            )}
            <div className="flex flex-wrap gap-2">
              {small(t.orders.hold, () => decide('hold'))}
              {small(t.orders.cancel, () => decide('cancel'), 'text-bad')}
            </div>
          </div>
        ) : (
          <p className="text-sm text-mist">{t.orders.ownerOnly}</p>
        ))}

      {s === 'DELIVERED' && can('orders.deliver') && (
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => act(() => api(`/orders/${order.id}/close`, { method: 'POST' }))}
        >
          {t.orders.close}
        </Button>
      )}

      {['CLOSED', 'REJECTED', 'CANCELLED', 'PRICE_CHANGED'].includes(s) && (
        <p className="text-sm text-mist">{t.orders.status[s]}</p>
      )}
    </Card>
  );
}

function Payments({ order, canRecord, act }: { order: OrderDetail; canRecord: boolean; act: Act }) {
  const open = ['APPROVED_FOR_DELIVERY', 'DELIVERED', 'CLOSED'].includes(order.status);
  if (!open && order.payments.length === 0) return null;
  const record = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    void act(async () => {
      await api(`/orders/${order.id}/payments`, {
        method: 'POST',
        body: { amountSom: Number(f.get('amountSom')), note: String(f.get('note') ?? '').trim() || undefined },
      });
      form.reset();
    });
  };
  return (
    <Card>
      <h3 className="mb-2 font-semibold">{t.orders.payments}</h3>
      <ul className="grid gap-1 text-sm">
        {order.payments.map((p) => (
          <li key={p.id} className="flex justify-between gap-2">
            <span>
              {when(p.createdAt)}
              {p.note ? ` · ${p.note}` : ''}
            </span>
            <span className="tabular-nums">{som(p.amountSom)}</span>
          </li>
        ))}
        {order.payments.length === 0 && <li className="text-mist">{t.orders.noPayments}</li>}
      </ul>
      {canRecord && open && order.paymentStatus !== 'PAID' && (
        <form onSubmit={record} className="mt-3 grid gap-2">
          <input
            name="amountSom"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            max={order.totalSom - order.amountPaidSom}
            required
            aria-label={t.orders.amount}
            placeholder={t.orders.amount}
            className={input}
          />
          <input name="note" maxLength={300} aria-label={t.orders.note} placeholder={t.orders.note} className={input} />
          <Button variant="ghost" type="submit">
            {t.orders.recordPayment}
          </Button>
        </form>
      )}
    </Card>
  );
}
