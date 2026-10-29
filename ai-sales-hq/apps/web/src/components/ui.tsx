import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { t } from '@/lib/strings';

export function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div
        aria-hidden
        className="grid size-9 place-items-center rounded-xl border border-gold/40 bg-navy font-serif text-sm tracking-wider text-gold"
      >
        UT
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-wide">{t.appName}</div>
        <div className="text-xs text-mist">{t.appSubtitle}</div>
      </div>
    </div>
  );
}

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <Brand />
      <section
        className="mt-8 rounded-2xl border border-line bg-graphite p-6"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        <h1 className="mb-5 text-xl font-semibold">{title}</h1>
        {children}
      </section>
    </main>
  );
}

export function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm text-mist">{label}</span>
      <input
        {...props}
        className="w-full rounded-xl border border-line bg-ink px-3.5 py-3 text-base text-paper placeholder:text-mist/60 focus:border-gold/70 focus:outline-none"
      />
    </label>
  );
}

export function Button({
  children,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const style =
    variant === 'primary'
      ? 'bg-gold text-ink hover:bg-gold-soft disabled:opacity-60'
      : 'border border-line text-paper hover:border-gold/50';
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 font-medium transition-colors ${style} ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function Alert({ kind, children }: { kind: 'error' | 'info' | 'ok'; children: ReactNode }) {
  const color =
    kind === 'error' ? 'border-bad/50 text-bad' : kind === 'ok' ? 'border-ok/50 text-ok' : 'border-line text-mist';
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={`mb-4 rounded-xl border px-3.5 py-3 text-sm ${color}`}>
      {children}
    </p>
  );
}

export function Spinner() {
  return (
    <main className="grid min-h-dvh place-items-center text-mist" aria-busy="true">
      {t.loading}
    </main>
  );
}
