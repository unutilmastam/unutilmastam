'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppShell, Card, Pill } from '@/components/shell';
import { Alert } from '@/components/ui';
import { api, type Me } from '@/lib/api';
import { type ProspectRow, phone, STAGE_TONE } from '@/lib/prospects';
import { t } from '@/lib/strings';

interface Page {
  total: number;
  page: number;
  pageSize: number;
  items: ProspectRow[];
}

const DISTRICTS = [
  'Termiz',
  'Denov',
  "Sho'rchi",
  'Sherobod',
  "Jarqo'rg'on",
  "Qumqo'rg'on",
  'Boysun',
  'Sariosiyo',
  'Uzun',
  'Angor',
  'Qiziriq',
  'Muzrabot',
  'Oltinsoy',
  'Bandixon',
];

export default function ProspectsPage() {
  return (
    <AppShell title={t.prospects.title} subtitle={t.prospects.intro}>
      {(me) => <Prospects me={me} />}
    </AppShell>
  );
}

function Prospects({ me }: { me: Me }) {
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState('');
  const [district, setDistrict] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const canEdit = me.permissions.includes('prospects.edit');

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (stage) params.set('stage', stage);
    if (district) params.set('district', district);
    if (q.trim()) params.set('q', q.trim());
    params.set('page', String(page));
    try {
      setData(await api<Page>(`/prospects?${params.toString()}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [stage, district, q, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 300); // debounce typing
    return () => clearTimeout(timer);
  }, [load]);

  const select = 'input min-h-11';
  return (
    <div className="grid gap-4">
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Link href="/prospects/new/" className="btn btn-primary px-4">
            + {t.prospects.add}
          </Link>
          <Link href="/prospects/import/" className="btn btn-secondary px-4">
            {t.prospects.import}
          </Link>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder={t.prospects.search}
          aria-label={t.prospects.search}
          className={`${select} w-full`}
        />
        <select
          aria-label={t.prospects.allStages}
          value={stage}
          onChange={(e) => {
            setStage(e.target.value);
            setPage(1);
          }}
          className={select}
        >
          <option value="">{t.prospects.allStages}</option>
          {Object.entries(t.prospects.stage).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label={t.prospects.allDistricts}
          value={district}
          onChange={(e) => {
            setDistrict(e.target.value);
            setPage(1);
          }}
          className={select}
        >
          <option value="">{t.prospects.allDistricts}</option>
          {DISTRICTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {data && data.items.length === 0 && (
        <Card>
          <p className="text-mist">{t.prospects.empty}</p>
        </Card>
      )}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-2">
        {data?.items.map((p) => (
          <li key={p.id} className="min-w-0">
            <Link
              href={`/prospects/view/?id=${p.id}`}
              className="surface block rounded-2xl border border-line p-4 transition-colors hover:border-line-strong"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{p.name}</h2>
                  <p className="truncate text-xs text-mist">
                    {[t.prospects.category[p.category], p.district, p.isExistingCustomer ? t.prospects.existing : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={`text-xl font-semibold tabular-nums ${p.score === null ? 'text-mist' : p.score >= 60 ? 'text-ok' : p.score >= 40 ? 'text-gold' : 'text-paper'}`}
                  >
                    {p.score ?? '—'}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-mist">{t.prospects.score}</div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Pill tone={STAGE_TONE[p.stage] ?? 'muted'}>{t.prospects.stage[p.stage]}</Pill>
                {p.contacts
                  .filter((c) => c.kind === 'PHONE')
                  .slice(0, 1)
                  .map((c) => (
                    <span key={c.id} className="text-mist">
                      {phone(c.value)} {c.isVerified ? '✓' : `(${t.prospects.unverified})`}
                    </span>
                  ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn btn-secondary">
            {t.prospects.prev}
          </button>
          <span className="text-mist">{t.prospects.total(data.total)}</span>
          <button
            type="button"
            disabled={page * data.pageSize >= data.total}
            onClick={() => setPage(page + 1)}
            className="btn btn-secondary"
          >
            {t.prospects.next}
          </button>
        </div>
      )}
    </div>
  );
}
