'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AppShell, Card, Pill } from '@/components/shell';
import { Alert, Button } from '@/components/ui';
import { api } from '@/lib/api';
import { phone } from '@/lib/prospects';
import { t } from '@/lib/strings';

interface PreviewRow {
  line: number;
  status: 'ok' | 'invalid' | 'duplicate_in_file' | 'exists';
  reason: string | null;
  name: string;
  phone: string | null;
  district: string | null;
}

const TONE = { ok: 'ok', exists: 'gold', invalid: 'bad', duplicate_in_file: 'warn' } as const;

export default function ImportPage() {
  return <AppShell title={t.prospects.csv.title}>{() => <Import />}</AppShell>;
}

function Import() {
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; counts: Record<string, number> } | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid max-w-3xl gap-4">
      <Link href="/prospects/" className="text-sm text-gold">
        {t.prospects.back}
      </Link>
      <Card>
        <p className="mb-3 text-sm text-mist">{t.prospects.csv.help}</p>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-mist">{t.prospects.csv.file}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              setPreview(null);
              setCsv(file ? await file.text() : null);
            }}
            className="block w-full text-sm"
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="ghost"
            disabled={!csv || busy}
            onClick={() =>
              run(async () => setPreview(await api('/prospects/import/preview', { method: 'POST', body: { csv } })))
            }
          >
            {t.prospects.csv.preview}
          </Button>
          <Button
            disabled={!preview || busy || (preview.counts.ok ?? 0) + (preview.counts.exists ?? 0) === 0}
            onClick={() =>
              run(async () => {
                const r = await api<{ created: number; merged: number; rejected: number }>('/prospects/import', {
                  method: 'POST',
                  body: { csv },
                });
                setMsg({ kind: 'ok', text: t.prospects.csv.done(r) });
                setPreview(null);
              })
            }
          >
            {t.prospects.csv.run}
          </Button>
        </div>
      </Card>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {preview && (
        <Card>
          <p className="mb-3 text-sm">{t.prospects.csv.counts(preview.counts)}</p>
          <ul className="grid gap-1 text-sm">
            {preview.rows.map((r) => (
              <li
                key={r.line}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-1 first:border-0"
              >
                <span className="min-w-0">
                  <span className="text-mist">#{r.line}</span> {r.name || '—'} {r.phone ? `· ${phone(r.phone)}` : ''}{' '}
                  {r.district ? `· ${r.district}` : ''}
                </span>
                <Pill tone={TONE[r.status]}>{r.reason ?? t.prospects.csv.status[r.status]}</Pill>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
