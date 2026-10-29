// Live "website today" overview for the owner (D-019). Pure: input is the raw JSON of the PWA's
// app/* documents, output is counts and business data only. Personal customers (userType
// "customer", personal orders) are only counted — no names or phones leave this function.

const arr = (json: string | null): Record<string, unknown>[] => {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [];
  } catch {
    return [];
  }
};
const str = (v: unknown, max = 120): string | null =>
  typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, max) : null;
const money = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 1e12 ? Math.round(n) : 0;
};

export interface SiteInput {
  products: string | null;
  stores: string | null;
  users: string | null;
  orders: string | null;
  ledger: string | null;
}

export function siteOverview(input: SiteInput, todayIso: string) {
  const products = arr(input.products);
  const stores = arr(input.stores);
  const users = arr(input.users);
  const orders = arr(input.orders);
  const ledger = arr(input.ledger);
  const storeName = new Map(stores.map((s) => [String(s.id), str(s.name) ?? '—']));

  const owners = users.filter((u) => u.userType === 'store');
  const status = (u: Record<string, unknown>) => (typeof u.storeStatus === 'string' ? u.storeStatus : 'approved');

  const byStatus: Record<string, number> = {};
  for (const o of orders) {
    const s = str(o.status, 30) ?? 'nomaʼlum';
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }
  const isStoreOrder = (o: Record<string, unknown>) => o.orderType === 'dokon' || !!str(o.storeId, 64);
  const storeOrders = orders.filter(isStoreOrder);

  const debtByStore = new Map<string, number>();
  for (const l of ledger) {
    if (l.partyType !== 'store') continue;
    const id = str(l.partyId, 64);
    if (!id) continue;
    debtByStore.set(id, (debtByStore.get(id) ?? 0) + money(l.debt));
  }
  const debts = [...debtByStore]
    .filter(([, d]) => d > 0)
    .map(([id, debt]) => ({ storeId: id, name: storeName.get(id) ?? '—', debtSom: debt }))
    .sort((a, b) => b.debtSom - a.debtSom);

  return {
    products: {
      total: products.length,
      withShopPrice: products.filter((p) => money(p.priceStore) > 0).length,
      outOfStock: products.filter((p) => p.stock === 0).length,
    },
    stores: {
      total: stores.length,
      withoutLocation: stores.filter((s) => typeof s.lat !== 'number' || s.needsLocation === true).length,
    },
    storeOwners: {
      approved: owners.filter((u) => status(u) === 'approved').length,
      pending: owners.filter((u) => status(u) === 'pending').length,
      rejected: owners.filter((u) => status(u) === 'rejected').length,
      pendingList: owners
        .filter((u) => status(u) === 'pending')
        .slice(0, 20)
        .map((u, i) => ({ id: str(u.id, 64) ?? `u${i}`, storeName: str(u.storeName) ?? '—' })),
    },
    customers: users.filter((u) => u.userType !== 'store' && u.role !== 'admin').length,
    orders: {
      total: orders.length,
      today: orders.filter((o) => o.date === todayIso).length,
      new: byStatus.yangi ?? 0,
      byStatus,
      storeOrders: storeOrders.length,
      personalOrders: orders.length - storeOrders.length,
      recentStoreOrders: storeOrders
        .slice(-10)
        .reverse()
        .map((o, i) => ({
          id: str(o.id, 64) ?? `o${i}`,
          date: str(o.date, 10),
          storeName: str(o.storeName) ?? storeName.get(String(o.storeId)) ?? '—',
          totalSom: money(o.total),
          status: str(o.status, 30),
        })),
    },
    debts: {
      totalSom: debts.reduce((s, d) => s + d.debtSom, 0),
      stores: debts.length,
      top: debts.slice(0, 10),
    },
  };
}
