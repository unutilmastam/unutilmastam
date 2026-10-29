'use client';

import { useEffect, useState } from 'react';
import { Icon } from './icons';

const KEY = 'hq-theme';
type Theme = 'dark' | 'light';

// Theme choice is a UI preference, the only kind of data kept in localStorage (MASTER_SPEC §3).
function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function applyStoredTheme() {
  const theme = stored() ?? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle({ labels }: { labels: { light: string; dark: string } }) {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      aria-label={next === 'light' ? labels.light : labels.dark}
      title={next === 'light' ? labels.light : labels.dark}
      className="grid size-10 place-items-center rounded-xl border border-line text-mist hover:border-gold/50 hover:text-paper"
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(KEY, next);
        } catch {
          // private mode: the choice simply is not remembered
        }
        setTheme(next);
      }}
    >
      <Icon name={next === 'light' ? 'sun' : 'moon'} size={18} />
    </button>
  );
}
