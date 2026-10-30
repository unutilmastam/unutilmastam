'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type Me } from './api';

/** Loads the current user; sends the browser to /setup, /login or /security when needed. */
export function useSession({ allowUnenrolled = false } = {}) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<Me>('/auth/me');
      if (data.mustEnrollTotp && !allowUnenrolled) {
        router.replace('/security/');
        return;
      }
      setMe(data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        const status = await api<{ needsSetup: boolean }>('/setup/status').catch(() => null);
        router.replace(status?.needsSetup ? '/setup/' : '/login/');
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [router, allowUnenrolled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { me, error, reload: load };
}
