import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseBody, requireAuth } from '../../http/guard';
import { type AiProviderService, aiKeyInputSchema } from './ai-provider';
import { type SalesService, salesSettingsSchema } from './service';

const prospectParam = z.object({ id: z.uuid() });
const messageParam = z.object({ id: z.uuid() });
const CHANNELS = ['PHONE_CALL', 'SMS', 'TELEGRAM', 'IN_PERSON'] as const;

export function salesRoutes(app: FastifyInstance, deps: { sales: SalesService; ai: AiProviderService }) {
  const { sales, ai } = deps;
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

  // ---- AI provider: status, key saved in the app (D-017), real test ----

  app.get('/integrations/ai', { config: { access: 'integrations.manage' } }, async () => {
    const [status, s, spent] = await Promise.all([ai.status(), sales.settings(), sales.aiSpentTodayMicroUsd()]);
    return { ...status, spentTodayUsd: Number(spent) / 1_000_000, budgetUsd: s.aiDailyBudgetUsd, enabled: s.aiEnabled };
  });

  app.post('/integrations/ai/key', { config: { access: 'integrations.manage' } }, async (req) =>
    ai.save(parseBody(aiKeyInputSchema, req.body), requireAuth(req).user.id),
  );

  app.post('/integrations/ai/key/remove', { config: { access: 'integrations.manage' } }, async (req) =>
    ai.remove(requireAuth(req).user.id),
  );

  app.post('/integrations/ai/test', { config: { access: 'integrations.manage' } }, async (req) =>
    ai.test(requireAuth(req).user.id),
  );
}
