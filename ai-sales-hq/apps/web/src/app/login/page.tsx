'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alert, AuthCard, Button, Field } from '@/components/ui';
import { api, type Me } from '@/lib/api';
import { t } from '@/lib/strings';

type LoginResponse = { status: 'totp_required' } | ({ status: 'ok' } & Me);

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'password' | 'totp'>('password');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const done = (res: LoginResponse) => {
    if (res.status === 'ok') router.replace(res.mustEnrollTotp ? '/security/' : '/');
    else setStep('totp');
  };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      if (step === 'password') {
        done(
          await api<LoginResponse>('/auth/login', {
            method: 'POST',
            body: { username: form.get('username'), password: form.get('password') },
          }),
        );
      } else {
        done(await api<LoginResponse>('/auth/login/totp', { method: 'POST', body: { code: form.get('code') } }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title={step === 'password' ? t.login.title : t.login.totpTitle}>
      {error && <Alert kind="error">{error}</Alert>}
      <form onSubmit={submit} noValidate>
        {step === 'password' ? (
          <>
            <Field label={t.login.username} name="username" autoComplete="username" autoCapitalize="none" required />
            <Field label={t.login.password} name="password" type="password" autoComplete="current-password" required />
            <Button type="submit" disabled={busy}>
              {t.login.submit}
            </Button>
          </>
        ) : (
          <>
            <Alert kind="info">{t.login.totpHint}</Alert>
            <Field
              label={t.security.code}
              name="code"
              inputMode="text"
              autoComplete="one-time-code"
              autoFocus
              required
            />
            <Button type="submit" disabled={busy}>
              {t.login.totpSubmit}
            </Button>
            <Button type="button" variant="ghost" className="mt-3" onClick={() => setStep('password')}>
              {t.login.back}
            </Button>
          </>
        )}
      </form>
    </AuthCard>
  );
}
