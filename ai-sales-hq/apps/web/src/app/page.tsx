'use client';

import { useEffect, useState } from 'react';
import { AppShell, Card } from '@/components/shell';
import { api } from '@/lib/api';
import { t } from '@/lib/strings';

type Ready = { status: string; database: string };

export default function HomePage() {
  return <AppShell title={t.home.system}>{(me) => <Home name={me.user.displayName} />}</AppShell>;
}

function Home({ name }: { name: string }) {
  const [ready, setReady] = useState<Ready | 'down' | null>(null);
  useEffect(() => {
    api<Ready>('/ready')
      .then(setReady)
      .catch(() => setReady('down'));
  }, []);
  const dbOk = ready !== null && ready !== 'down' && ready.database === 'ok';
  return (
    <>
      <p className="mb-1 text-lg">{t.home.greeting(name)}</p>
      <p className="mb-6 text-mist">{t.home.phaseNote}</p>
      <Card>
        <dl className="space-y-3">
          <Row label={t.home.api} ok={ready !== 'down'} pending={ready === null} />
          <Row label={t.home.database} ok={dbOk} pending={ready === null} />
        </dl>
      </Card>
    </>
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
