'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alert, AuthCard, Button, Field, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { t } from '@/lib/strings';

export default function SecurityPage() {
  const router = useRouter();
  const { me, error: loadError } = useSession({ allowUnenrolled: true });
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = new FormData(e.currentTarget).get('code');
    await run(async () => {
      const res = await api<{ recoveryCodes: string[] }>('/auth/totp/confirm', { method: 'POST', body: { code } });
      setCodes(res.recoveryCodes);
    });
  }

  if (!me)
    return loadError ? (
      <AuthCard title={t.security.title}>
        <Alert kind="error">{loadError}</Alert>
      </AuthCard>
    ) : (
      <Spinner />
    );

  if (codes) {
    return (
      <AuthCard title={t.security.recoveryTitle}>
        <Alert kind="info">{t.security.recoveryHint}</Alert>
        <ul className="mb-5 grid grid-cols-2 gap-2 font-mono text-sm">
          {codes.map((c) => (
            <li key={c} className="rounded-lg border border-line bg-ink px-3 py-2 text-center">
              {c}
            </li>
          ))}
        </ul>
        <Button onClick={() => router.replace('/')}>{t.security.recoveryDone}</Button>
      </AuthCard>
    );
  }

  if (me.user.totpEnabled) {
    return (
      <AuthCard title={t.security.title}>
        <Alert kind="ok">{t.security.enabled}</Alert>
        <Button variant="ghost" onClick={() => router.replace('/')}>
          {t.login.back}
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t.security.title}>
      {me.mustEnrollTotp && <Alert kind="info">{t.security.required}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      <ol className="mb-5 space-y-2 text-sm text-mist">
        <li>{t.security.step1}</li>
        <li>{t.security.step2}</li>
        <li>{t.security.step3}</li>
      </ol>
      {!setup ? (
        <Button
          disabled={busy}
          onClick={() =>
            run(async () =>
              setSetup(await api<{ secret: string; qrSvg: string }>('/auth/totp/setup', { method: 'POST' })),
            )
          }
        >
          {t.security.start}
        </Button>
      ) : (
        <form onSubmit={confirm} noValidate>
          <img
            src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`}
            alt="QR"
            className="mx-auto mb-4 w-56 rounded-xl bg-white p-3"
          />
          <p className="mb-1 text-xs text-mist">{t.security.manualKey}</p>
          <p className="mb-4 break-all rounded-lg border border-line bg-ink px-3 py-2 font-mono text-sm">
            {setup.secret}
          </p>
          <Field
            label={t.security.code}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            required
          />
          <Button type="submit" disabled={busy}>
            {t.security.confirm}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
