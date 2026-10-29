import { t } from './strings';

export interface Me {
  user: { id: string; username: string; displayName: string; role: 'OWNER' | 'STAFF'; totpEnabled: boolean };
  csrfToken: string;
  mustEnrollTotp: boolean;
  permissions: string[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;
export const setCsrf = (token: string | null) => {
  csrfToken = token;
};

/** Turns any failed response body into a user-readable ApiError. */
export function toApiError(status: number, body: unknown): ApiError {
  const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
  return new ApiError(status, err?.code ?? 'unknown', err?.message ?? t.networkError);
}

export async function api<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(method !== 'GET' && csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : method === 'POST' ? '{}' : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', t.networkError);
  }
  const text = await res.text();
  const body = text ? safeParse(text) : null;
  if (!res.ok) throw toApiError(res.status, body);
  const csrf = (body as { csrfToken?: unknown } | null)?.csrfToken;
  if (typeof csrf === 'string') setCsrf(csrf);
  return body as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
