import { describe, expect, it } from 'vitest';
import { toApiError } from '@/lib/api';
import { t } from '@/lib/strings';

describe('toApiError', () => {
  it('uses the server message', () => {
    const e = toApiError(401, { error: { code: 'unauthorized', message: 'Tizimga kiring' } });
    expect(e).toMatchObject({ status: 401, code: 'unauthorized', message: 'Tizimga kiring' });
  });
  it('falls back to a generic Uzbek message', () => {
    expect(toApiError(502, null).message).toBe(t.networkError);
  });
});
