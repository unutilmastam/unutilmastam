import type { FastifyInstance } from 'fastify';
import type { Config } from '../../config';
import { requireAuth } from '../../http/guard';
import { safeEqual } from '../../lib/crypto';
import type { TelegramService } from './service';

export function telegramRoutes(app: FastifyInstance, deps: { telegram: TelegramService; config: Config }) {
  const { telegram, config } = deps;

  app.get('/integrations/telegram', { config: { access: 'integrations.manage' } }, async () => telegram.status());

  app.post('/integrations/telegram/test', { config: { access: 'integrations.manage' } }, async (req) =>
    telegram.test(requireAuth(req).user.id),
  );

  app.post('/integrations/telegram/webhook', { config: { access: 'integrations.manage' } }, async (req) =>
    telegram.setWebhook(requireAuth(req).user.id),
  );

  // Called by Telegram. Authenticated by the secret header set in setWebhook, not by a session.
  app.post('/telegram/webhook', { config: { access: 'webhook' } }, async (req, reply) => {
    const secret = config.TELEGRAM_WEBHOOK_SECRET;
    const sent = req.headers['x-telegram-bot-api-secret-token'];
    if (!secret || typeof sent !== 'string' || !safeEqual(sent, secret)) {
      return reply.code(401).send({ ok: false });
    }
    const answer = await telegram.handleUpdate(req.body as object);
    // Reply inside the webhook response (Bot API "making requests when getting updates").
    return answer ? { method: 'sendMessage', chat_id: answer.chatId, text: answer.text } : { ok: true };
  });
}
