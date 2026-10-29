import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, useId } from 'react';
import { Icon } from '@/components/icons';
import { t } from '@/lib/strings';

/** Brand mark: a monogram on a champagne gradient tile. */
export function BrandMark({ size = 36 }: { size?: number }) {
  // Unique gradient ids: a hidden copy (e.g. the desktop sidebar on a phone) must not own them.
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ecd3a0" />
          <stop offset="1" stopColor="#a8884f" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${id}g)`} />
      <rect x="0.5" y="0.5" width="39" height="39" rx="10.5" fill="none" stroke={`url(#${id}s)`} />
      <path d="M12 11v10.5a8 8 0 0 0 16 0V11" fill="none" stroke="#14110b" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M20 11v13" stroke="#14110b" strokeWidth="3.2" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <BrandMark size={compact ? 32 : 36} />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[15px] font-semibold tracking-[-0.01em]">{t.appName}</div>
        <div className="truncate text-xs text-mist">{t.appSubtitle}</div>
      </div>
    </div>
  );
}

/** Sign-in / setup frame: a quiet brand panel beside the form on wide screens. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-line lg:block">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(700px 420px at 20% 10%, rgba(211,179,122,0.16), transparent 60%), radial-gradient(600px 500px at 90% 90%, rgba(121,168,255,0.08), transparent 60%)',
          }}
        />
        <AuthArt />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Brand />
          <div className="max-w-md">
            <p className="eyebrow mb-4">{t.auth.eyebrow}</p>
            <h2 className="text-[34px] font-semibold leading-[1.15] tracking-[-0.025em]">{t.auth.headline}</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-mist">{t.auth.lead}</p>
          </div>
          <p className="text-xs text-faint">{t.auth.footer}</p>
        </div>
      </aside>
      <section className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-10 lg:hidden">
            <Brand />
          </div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{title}</h1>
          <p className="mt-1.5 mb-7 text-sm text-mist">{t.auth.secure}</p>
          {children}
        </div>
      </section>
    </main>
  );
}

/** Thin isometric line drawing behind the sign-in copy. */
function AuthArt() {
  const rows = Array.from({ length: 9 }, (_, i) => i);
  return (
    <svg className="absolute inset-0 h-full w-full opacity-[0.35]" viewBox="0 0 600 800" aria-hidden="true">
      <g stroke="var(--color-gold)" strokeOpacity="0.18" fill="none">
        {rows.map((i) => (
          <path key={`a${i}`} d={`M${-200 + i * 90} 800 L${400 + i * 90} 450`} />
        ))}
        {rows.map((i) => (
          <path key={`b${i}`} d={`M${-100 + i * 90} 450 L${500 + i * 90} 800`} />
        ))}
      </g>
    </svg>
  );
}

export function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-[13px] font-medium text-mist">{label}</span>
      <input
        {...props}
        className="h-12 w-full rounded-xl border border-line bg-graphite px-3.5 text-[15px] text-paper shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] transition-colors placeholder:text-faint hover:border-line-strong focus:border-gold/60 focus:outline-none focus:ring-4 focus:ring-gold/10"
      />
    </label>
  );
}

type Variant = 'primary' | 'ghost' | 'danger' | 'quiet';

export function Button({
  children,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const style: Record<Variant, string> = {
    primary: 'btn-gold text-[#16120a] font-semibold disabled:opacity-55',
    ghost: 'border border-line bg-graphite text-paper hover:border-line-strong hover:bg-panel disabled:opacity-55',
    danger: 'border border-bad/35 bg-bad/10 text-bad hover:bg-bad/15 disabled:opacity-55',
    quiet: 'text-mist hover:bg-panel hover:text-paper disabled:opacity-55',
  };
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-medium tracking-[-0.005em] transition-[background-color,border-color,filter,color] duration-150 disabled:cursor-not-allowed ${style[variant]} ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function Alert({ kind, children }: { kind: 'error' | 'info' | 'ok'; children: ReactNode }) {
  const color =
    kind === 'error'
      ? 'border-bad/30 bg-bad/[0.07] text-bad'
      : kind === 'ok'
        ? 'border-ok/30 bg-ok/[0.07] text-ok'
        : 'border-line bg-panel/60 text-mist';
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      className={`mb-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-relaxed ${color}`}
    >
      <Icon
        name={kind === 'error' ? 'alert' : kind === 'ok' ? 'check' : 'spark'}
        size={16}
        className="mt-0.5 shrink-0"
      />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export function Spinner() {
  return (
    <main className="grid min-h-dvh place-items-center" aria-busy="true">
      <div className="flex flex-col items-center gap-4">
        <BrandMark size={44} />
        <div className="h-1 w-28 overflow-hidden rounded-full bg-panel">
          <div className="skeleton h-full w-full" />
        </div>
        <span className="sr-only">{t.loading}</span>
      </div>
    </main>
  );
}
