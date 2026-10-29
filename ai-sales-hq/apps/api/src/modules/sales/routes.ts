import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from '../../config';
import { parseBody, requireAuth } from '../../http/guard';
import { pingAnthropic } from '../../integrations/ai';
import type { Db } from '../../lib/db';
import { AppError } from '../../lib/errors';
import { redactText } from '../../lib/logger';
import { writeAudit } from '../audit';
import { markIntegration } from '../integrations/service';
import { INTEGRATION_AI, type SalesService, salesSettingsSchema } from './service';

const prospectParam = z.object({ id: z.uuid() });
const messageParam = z.object({ id: z.uuid() });
const CHANNELS = ['PHONE_CALL', 'SMS', 'TELEGRAM', 'IN_PERSON'] as const;

export function salesRoutes(
  app: FastifyInstance,
  deps: { db: Db; sales: SalesService; config: Config; now: () => Date },
) {
  const { sales, db, config } = deps;
  const actorOf = (req: Parameters<typeof requireAuth>[0]) => ({ type: 'user' as const, id: requireAuth(req).user.id });

  app.get('/outreach', { config: { access: 'prospects.view' } }, async () => sales.desk());

  app.get('/prospects/:id/conversation', { config: { access: 'prospects.view' } }, async (req) =>
    sales.conversation(parseBody(prospectParam, req.params).id),
  );

  app.post('/prospects/:id/draft', { config: { access: 'prospects.edit' } }, async (req) => {
    const { strong } = parseBody(z.object({ strong: z.boolean().optional() }), req.body);
    return sales.draftOutreach(parseBody(prospectParam, req.params).id, actorOf(req), { strong });
  });

  app.post('/prospects/:id/reply-draft', { config: { access: 'prospects.edit' } }, async (req) => {
    const { strong } = parseBody(z.object({ strong: z.boolean().optional() }), req.body);
    return sales.suggestReply(parseBody(prospectParam, req.params).id, actorOf(req), { strong });
  });

  app.post('/prospects/:id/inbound', { config: { access: 'prospects.edit' } }, async (req) => {
    const body = parseBody(z.object({ body: z.string().trim().min(1).max(4000), channel: z.enum(CHANNELS) }), req.body);
    return sales.recordInbound(parseBody(prospectParam, req.params).id, body.body, body.channel, actorOf(req));
  });

  app.post('/prospects/:id/outcome', { config: { access: 'prospects.edit' } }, async (req) => {
    const body = parseBody(
      z.object({
        outcome: z.enum(['INTERESTED', 'NO_ANSWER', 'CALL_BACK', 'NOT_INTERESTED', 'DO_NOT_CONTACT']),
        followUpAt: z.iso.datetime().optional(),
        note: z.string().trim().max(300).optional(),
      }),
      req.body,
    );
    await sales.recordOutcome(parseBody(prospectParam, req.params).id, body.outcome, actorOf(req), {
      followUpAt: body.followUpAt ? new Date(body.followUpAt) : undefined,
      note: body.note,
    });
    return { ok: true };
  });

  app.post('/prospects/:id/owner-resolved', { config: { access: 'prospects.edit' } }, async (req) => {
    await sales.resolveNeedsOwner(parseBody(prospectParam, req.params).id, actorOf(req));
    return { ok: true };
  });

  app.post('/messages/:id/edit', { config: { access: 'prospects.edit' } }, async (req) => {
    const { body } = parseBody(z.object({ body: z.string().trim().min(1).max(2000) }), req.body);
    return sales.editDraft(parseBody(messageParam, req.params).id, body, actorOf(req));
  });

  app.post('/messages/:id/sent', { config: { access: 'prospects.edit' } }, async (req) => {
    const { channel } = parseBody(z.object({ channel: z.enum(CHANNELS) }), req.body);
    await sales.markSent(parseBody(messageParam, req.params).id, channel, actorOf(req));
    return { ok: true };
  });

  app.post('/messages/:id/discard', { config: { access: 'prospects.edit' } }, async (req) => {
    await sales.discard(parseBody(messageParam, req.params).id, actorOf(req));
    return { ok: true };
  });

  app.post('/sales/settings', { config: { access: 'settings.manage' } }, async (req) => {
    await sales.saveSettings(parseBody(salesSettingsSchema, req.body), requireAuth(req).user.id);
    return { ok: true };
  });

  // ---- AI provider status ----

  app.get('/integrations/ai', { config: { access: 'integrations.manage' } }, async () => {
    const row = await db.integration.findUnique({ where: { key: INTEGRATION_AI } });
    const configured = !!config.ANTHROPIC_API_KEY;
    const s = await sales.settings();
    return {
      provider: 'anthropic',
      model: config.AI_MODEL,
      strongModel: config.AI_MODEL_STRONG,
      status: !configured ? 'NOT_CONFIGURED' : row && row.status !== 'NOT_CONFIGURED' ? row.status : 'CONFIGURED',
      lastSuccessAt: row?.lastSuccessAt ?? null,
      lastError: row?.lastError ?? null,
      spentTodayUsd: Number(await sales.aiSpentTodayMicroUsd()) / 1_000_000,
      budgetUsd: s.aiDailyBudgetUsd,
      enabled: s.aiEnabled,
    };
  });

  app.post('/integrations/ai/test', { config: { access: 'integrations.manage' } }, async (req) => {
    if (!config.ANTHROPIC_API_KEY) throw new AppError(409, 'not_configured', 'AI provayder sozlanmagan');
    try {
      const usage = await pingAnthropic(config.ANTHROPIC_API_KEY, config.AI_MODEL);
      await markIntegration(db, INTEGRATION_AI, { ok: true, at: deps.now() });
      await writeAudit(db, { actor: actorOf(req), action: 'integration.ai_tested' });
      return { ok: true, model: config.AI_MODEL, ...usage };
    } catch (err) {
      const message = redactText(err instanceof Error ? err.message : String(err)).slice(0, 300);
      await markIntegration(db, INTEGRATION_AI, { ok: false, error: message, at: deps.now() });
      throw new AppError(502, 'ai_failed', message);
    }
  });
}
