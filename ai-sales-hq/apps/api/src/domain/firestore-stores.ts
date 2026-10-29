// Parses the PWA's existing store list (A4 source 1) from Firestore `app/stores`, `app/users`
// and `app/orders`. Only business fields are kept: password hashes, photos, IP addresses and
// personal customers (userType "customer") are dropped here and never stored (PROJECT_AUDIT S4/S5).

import { isPwaFallbackLocation } from './prospects';

export interface SourceStore {
  externalId: string; // "store:<id>" or "user:<id>"
  name: string;
  ownerName: string | null;
  phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  orderCount: number;
  lastOrderDate: string | null;
}

function arr(json: string | null): unknown[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const str = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, max) : null;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function parseStores(
  storesJson: string | null,
  usersJson: string | null,
  ordersJson: string | null,
): SourceStore[] {
  const orders = new Map<string, { count: number; last: string | null }>();
  for (const o of arr(ordersJson)) {
    const r = o as Record<string, unknown>;
    const sid = str(r.storeId, 64);
    if (!sid) continue;
    const cur = orders.get(sid) ?? { count: 0, last: null };
    const date = str(r.date, 10);
    cur.count++;
    if (date && (!cur.last || date > cur.last)) cur.last = date;
    orders.set(sid, cur);
  }

  const out: SourceStore[] = [];
  const linkedUsers = new Set<string>();
  for (const s of arr(storesJson)) {
    const r = s as Record<string, unknown>;
    const id = str(r.id, 64);
    const name = str(r.name);
    if (!id || !ID.test(id) || !name) continue;
    let lat = num(r.lat);
    let lng = num(r.lng);
    if (lat !== null && lng !== null && isPwaFallbackLocation(lat, lng)) {
      lat = null;
      lng = null;
    }
    const owner = str(r.ownerUserId, 64);
    if (owner) linkedUsers.add(owner);
    const o = orders.get(id);
    out.push({
      externalId: `store:${id}`,
      name,
      ownerName: str(r.ownerName, 120),
      phone: str(r.phone, 40),
      address: str(r.address, 300),
      lat,
      lng,
      orderCount: o?.count ?? 0,
      lastOrderDate: o?.last ?? null,
    });
  }
  // Registered store owners not yet linked to a store record.
  for (const u of arr(usersJson)) {
    const r = u as Record<string, unknown>;
    const id = str(r.id, 64);
    if (r.userType !== 'store' || !id || !ID.test(id) || linkedUsers.has(id) || r.blocked === true) continue;
    // v14.5: the owner rejected this registration on the website — not a prospect.
    if (r.storeStatus === 'rejected') continue;
    const name = str(r.storeName) ?? null;
    if (!name) continue;
    out.push({
      externalId: `user:${id}`,
      name,
      ownerName: str(r.name, 120),
      phone: str(r.contact, 40),
      address: str(r.address, 300),
      lat: num(r.homeLat),
      lng: num(r.homeLng),
      orderCount: 0,
      lastOrderDate: null,
    });
  }
  return out;
}
