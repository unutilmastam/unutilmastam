'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Brand, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { t } from '@/lib/strings';

type Ready = { status: string; database: string };

export default function HomePage() {
  const router = useRouter();
  const { me, error } = useSession();
  const [ready, setReady] = useState<Ready | 'down' | null>(null);

  useEffect(() => {
    if (!me) return;
    api<Ready>('/ready')
      .then(setReady)
      .catch(() => setReady('down'));
  }, [me]);

  if (error)
    return (
      <main className="p-6">
        <Alert kind="error">{error}</Alert>
      </main>
    );
  if (!me) return <Spinner />;

  const dbOk = ready !== null && ready !== 'down' && ready.database === 'ok';
  return (
    <main className="mx-auto max-w-3xl px-5 py-6">
      <header className="flex items-center justify-between">
        <Brand />
        <div className="flex gap-2">
          <Link href="/security/" className="rounded-xl border border-line px-3 py-2 text-sm hover:border-gold/50">
            {t.home.security}
          </Link>
          <button
            type="button"
            className="rounded-xl border border-line px-3 py-2 text-sm hover:border-gold/50"
            onClick={() => api('/auth/logout', { method: 'POST' }).finally(() => router.replace('/login/'))}
          >
            {t.home.logout}
          </button>
        </div>
      </header>
      <h1 className="mt-10 text-2xl font-semibold">{t.home.greeting(me.user.displayName)}</h1>
      <p className="mt-2 text-mist">{t.home.phaseNote}</p>
      <section className="mt-8 rounded-2xl border border-line bg-graphite p-5">
        <h2 className="mb-4 text-sm uppercase tracking-widest text-gold">{t.home.system}</h2>
        <dl className="space-y-3">
          <Row label={t.home.api} ok={ready !== 'down'} pending={ready === null} />
          <Row label={t.home.database} ok={dbOk} pending={ready === null} />
        </dl>
      </section>
    </main>
  );
}

function Row({ label, ok, pending }: { label: string; ok: boolean; pending: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt>{label}</dt>
      <dd className={pending ? 'text-mist' : ok ? 'text-ok' : 'text-bad'}>
        {pending ? t.loading : ok ? `● ${t.home.ok}` : `● ${t.home.down}`}
      </dd>
    </div>
  );
}
