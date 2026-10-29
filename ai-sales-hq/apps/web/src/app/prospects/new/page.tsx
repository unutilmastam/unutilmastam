'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { AppShell, Card } from '@/components/shell';
import { Alert, Button, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { t } from '@/lib/strings';

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

export default function NewProspectPage() {
  return <AppShell title={t.prospects.add}>{() => <NewProspect />}</AppShell>;
}

function NewProspect() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => {
      const v = String(f.get(k) ?? '').trim();
      return v ? v : undefined;
    };
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ action: string; prospectId: string }>('/prospects', {
        method: 'POST',
        body: {
          name: text('name'),
          phone: text('phone'),
          telegram: text('telegram'),
          address: text('address'),
          district: text('district'),
          category: text('category'),
          notes: text('notes'),
        },
      });
      router.push(`/prospects/view/?id=${r.prospectId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const select = 'w-full rounded-xl border border-line bg-ink px-3.5 py-3 text-base';
  return (
    <div className="max-w-xl">
      <Link href="/prospects/" className="text-sm text-gold">
        {t.prospects.back}
      </Link>
      <Card className="mt-3">
        {error && <Alert kind="error">{error}</Alert>}
        <form onSubmit={submit} noValidate>
          <Field label={t.prospects.form.name} name="name" required autoComplete="organization" />
          <Field label={t.prospects.form.phone} name="phone" type="tel" inputMode="tel" autoComplete="tel" />
          <Field label={t.prospects.form.telegram} name="telegram" autoCapitalize="none" />
          <Field label={t.prospects.form.address} name="address" />
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm text-mist">{t.prospects.form.district}</span>
            <select name="district" className={select} defaultValue="">
              <option value="">—</option>
              {DISTRICTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm text-mist">{t.prospects.form.category}</span>
            <select name="category" className={select} defaultValue="">
              <option value="">—</option>
              {Object.entries(t.prospects.category).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm text-mist">{t.prospects.form.notes}</span>
            <textarea name="notes" rows={3} className="w-full rounded-xl border border-line bg-ink p-3 text-base" />
          </label>
          <Button type="submit" disabled={busy}>
            {t.prospects.form.save}
          </Button>
        </form>
      </Card>
    </div>
  );
}
