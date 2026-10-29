import type { Config } from '../../config';
import type { Db } from '../../lib/db';
import { AppError } from '../../lib/errors';
import { redactText } from '../../lib/logger';
import type { AgentService } from '../agents/service';
import { writeAudit } from '../audit';
import { markIntegration } from '../integrations/service';
import { escapeHtml, ownerChatIds, type TelegramApi } from './client';

export const INTEGRATION_TELEGRAM = 'telegram';
const SEVERITY_ICON = { INFO: 'ℹ️', WARNING: '⚠️', CRITICAL: '🛑' } as const;
const STATE_LABEL: Record<string, string> = {
  DRAFT: 'tayyorlanmoqda',
  STOPPED: "to'xtatilgan",
  SCHEDULED: 'jadval kutmoqda',
  RUNNING: 'ishlayapti',
  PAUSING: "pauzaga o'tmoqda",
  PAUSED: 'pauzada',
  STOPPING: "to'xtamoqda",
  ERROR: 'xatolik',
  DISABLED: "o'chirilgan",
};

interface Update {
  message?: { chat?: { id?: number }; text?: string };
}

export class TelegramService {
  constructor(
    private readonly db: Db,
    private readonly config: Config,
    private readonly api: TelegramApi | null,
    private readonly agents: AgentService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get configured(): boolean {
    return !!this.api && ownerChatIds(this.config.TELEGRAM_OWNER_CHAT_IDS).length > 0;
  }

  async status() {
    const row = await this.db.integration.findUnique({ where: { key: INTEGRATION_TELEGRAM } });
    const status = !this.configured
      ? 'NOT_CONFIGURED'
      : row && row.status !== 'NOT_CONFIGURED'
        ? row.status
        : 'CONFIGURED';
    return {
      status,
      lastCheckedAt: row?.lastCheckedAt ?? null,
      lastSuccessAt: row?.lastSuccessAt ?? null,
      lastError: row?.lastError ?? null,
      webhookReady: !!this.config.TELEGRAM_WEBHOOK_SECRET,
      ownerChats: ownerChatIds(this.config.TELEGRAM_OWNER_CHAT_IDS).length,
    };
  }

  #require(): TelegramApi {
    if (!this.api || !this.configured) throw new AppError(409, 'not_configured', 'Telegram bot sozlanmagan');
    return this.api;
  }

  async #record<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      await markIntegration(this.db, INTEGRATION_TELEGRAM, { ok: true, at: this.now() });
      return result;
    } catch (err) {
      const message = redactText(err instanceof Error ? err.message : String(err));
      await markIntegration(this.db, INTEGRATION_TELEGRAM, { ok: false, error: message, at: this.now() });
      throw new AppError(502, 'telegram_failed', message);
    }
  }

  /** Real call (getMe + a test message to every owner chat). CONNECTED only if it succeeds. */
  async test(actorUserId: string) {
    const api = this.#require();
    const me = await this.#record(async () => {
      const bot = await api.call<{ username: string }>('getMe', {});
      for (const chat of ownerChatIds(this.config.TELEGRAM_OWNER_CHAT_IDS)) {
        await api.call('sendMessage', {
          chat_id: chat,
          text: '✅ AI Sotuv Shtabi: bot ulandi. Bildirishnomalar shu yerga keladi.',
        });
      }
      return bot;
    });
    await writeAudit(this.db, { actor: { type: 'user', id: actorUserId }, action: 'integration.telegram_tested' });
    return { ok: true, bot: me.username };
  }

  async setWebhook(actorUserId: string) {
    const api = this.#require();
    if (!this.config.TELEGRAM_WEBHOOK_SECRET) {
      throw new AppError(409, 'no_secret', "TELEGRAM_WEBHOOK_SECRET ko'rsatilmagan");
    }
    const url = `${this.config.APP_ORIGIN.replace(/\/$/, '')}/api/v1/telegram/webhook`;
    await this.#record(() =>
      api.call('setWebhook', {
        url,
        secret_token: this.config.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ['message'],
        drop_pending_updates: true,
      }),
    );
    await writeAudit(this.db, { actor: { type: 'user', id: actorUserId }, action: 'integration.telegram_webhook_set' });
    return { ok: true, url };
  }

  /** Delivers unsent notifications (oldest first). Used by the `notify.telegram` system job. */
  async deliverPending(limit = 20): Promise<number> {
    if (!this.configured || !this.api) return 0;
    const api = this.api;
    const pending = await this.db.notification.findMany({
      where: { telegramSentAt: null, readAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let sent = 0;
    for (const n of pending) {
      const text = `${SEVERITY_ICON[n.severity]} <b>${escapeHtml(n.title)}</b>\n${escapeHtml(n.body)}`;
      await this.#record(async () => {
        for (const chat of ownerChatIds(this.config.TELEGRAM_OWNER_CHAT_IDS)) {
          await api.call('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true });
        }
      });
      await this.db.notification.update({ where: { id: n.id }, data: { telegramSentAt: this.now() } });
      sent++;
    }
    return sent;
  }

  async hasPending(): Promise<boolean> {
    if (!this.configured) return false;
    return (await this.db.notification.count({ where: { telegramSentAt: null, readAt: null } })) > 0;
  }

  /**
   * Handles a webhook update from an allow-listed chat and returns the reply text (sent back in
   * the webhook response, so no outbound call is needed). Unknown chats get no answer at all.
   */
  async handleUpdate(update: Update): Promise<{ chatId: number; text: string } | null> {
    const chatId = update.message?.chat?.id;
    const text = update.message?.text?.trim() ?? '';
    if (chatId === undefined || !ownerChatIds(this.config.TELEGRAM_OWNER_CHAT_IDS).includes(String(chatId)))
      return null;
    const command = text.split(/\s+/)[0]?.split('@')[0]?.toLowerCase();
    const actor = { type: 'system' as const, id: `telegram:${chatId}` };

    if (command === '/status') {
      const overview = await this.agents.overview();
      const unread = await this.db.notification.count({ where: { readAt: null } });
      const lines = overview.map(
        (a) => `• ${a.name}: ${STATE_LABEL[a.state] ?? a.state} (bugun ${a.tasksToday} ta vazifa)`,
      );
      return { chatId, text: `📊 Holat\n${lines.join('\n')}\n\nO'qilmagan bildirishnomalar: ${unread}` };
    }
    if (command === '/stop_all') {
      const stopped = await this.agents.stopAll(actor);
      await writeAudit(this.db, { actor, action: 'agents.stop_all', details: { stopped } });
      return { chatId, text: `🛑 ${stopped} ta agent to'xtatildi. Qayta yoqish faqat ilovadan.` };
    }
    return {
      chatId,
      text: "Buyruqlar:\n/status — agentlar holati\n/stop_all — barcha agentlarni darhol to'xtatish",
    };
  }
}
