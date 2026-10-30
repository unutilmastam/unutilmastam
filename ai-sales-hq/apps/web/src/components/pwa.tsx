'use client';

import { useEffect } from 'react';
import { applyStoredTheme } from './theme';

/** Applies the saved theme and registers the service worker (static shell only). */
export function ClientBoot() {
  useEffect(() => {
    applyStoredTheme();
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);
  return null;
}
