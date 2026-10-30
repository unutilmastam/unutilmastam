// Minimal Telegram Bot API client for the owner bot. The token never leaves the server and is
// redacted from logs (lib/logger.ts).

type FetchFn = typeof fetch;

export interface TelegramApi {
  call<T>(method: string, body: object): Promise<T>;
}

export class TelegramError extends Error {}

export function telegramApi(token: string, fetchFn: FetchFn = fetch): TelegramApi {
  return {
    async call<T>(method: string, body: object): Promise<T> {
      let res: Response;
      try {
        res = await fetchFn(`https://api.telegram.org/bot${token}/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (e) {
        throw new TelegramError(`Telegram unreachable: ${(e as Error).message}`);
      }
      const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
      if (!res.ok || !json?.ok) {
        throw new TelegramError(`Telegram ${method} failed: ${json?.description ?? `HTTP ${res.status}`}`);
      }
      return json.result as T;
    },
  };
}

export function ownerChatIds(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Telegram HTML mode: escape the three characters it interprets. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
