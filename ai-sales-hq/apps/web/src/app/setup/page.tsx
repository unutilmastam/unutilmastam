'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert, AuthCard, Button, Field, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { t } from '@/lib/strings';

export default function SetupPage() {
  const router = useRouter();
  const [status, setStatus] = useState<{ needsSetup: boolean; setupEnabled: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ needsSetup: boolean; setupEnabled: boolean }>('/setup/status')
      .then((s) => (s.needsSetup ? setStatus(s) : router.replace('/login/')))
      .catch((e: Error) => setError(e.message));
  }, [router]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api('/setup', {
        method: 'POST',
        body: {
          setupToken: f.get('setupToken'),
          displayName: f.get('displayName'),
          username: f.get('username'),
          password: f.get('password'),
        },
      });
      router.replace('/login/');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!status && !error) return <Spinner />;
  return (
    <AuthCard title={t.setup.title}>
      {error && <Alert kind="error">{error}</Alert>}
      {status && !status.setupEnabled ? (
        <Alert kind="info">{t.setup.disabled}</Alert>
      ) : (
        <form onSubmit={submit} noValidate>
          <Alert kind="info">{t.setup.intro}</Alert>
          <Field label={t.setup.token} name="setupToken" type="password" autoComplete="off" required />
          <Field label={t.setup.displayName} name="displayName" autoComplete="name" required />
          <Field label={t.setup.username} name="username" autoCapitalize="none" autoComplete="username" required />
          <Field label={t.setup.password} name="password" type="password" autoComplete="new-password" required />
          <Button type="submit" disabled={busy}>
            {t.setup.submit}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
