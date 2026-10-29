import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CATEGORIES,
  normalizePhone,
  normalizeTelegram,
  PROSPECT_STAGES,
  SURXONDARYO_DISTRICTS,
} from '../../domain/prospects';
import { parseBody, requireAuth } from '../../http/guard';
import type { Db } from '../../lib/db';
import { badRequest } from '../../lib/errors';
import { writeAudit } from '../audit';
import { type DiscoveryService, discoverySettingsSchema } from '../discovery/service';
import type { ProspectService } from './service';

const idParam = z.object({ id: z.uuid() });
const listQuery = z.object({
  stage: z.enum(PROSPECT_STAGES).optional(),
  district: z.string().max(60).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
});
const manualBody = z.object({
  name: z.string().trim().min(2).max(200),
  phone: z.string().trim().max(40).optional(),
  telegram: z.string().trim().max(60).optional(),
  address: z.string().trim().max(300).optional(),
  district: z.string().trim().max(60).optional(),
  category: z.enum(CATEGORIES).optional(),
  notes: z.string().trim().max(2000).optional(),
});
const csvBody = z.object({ csv: z.string().min(1).max(2_000_000) });
const stageBody = z.object({ to: z.enum(PROSPECT_STAGES), reason: z.string().trim().max(300).optional() });
const contactBody = z.object({ kind: z.enum(['PHONE', 'TELEGRAM']), value: z.string().trim().min(3).max(60) });
const searchBody = z.object({
  query: z.string().trim().min(2).max(80),
  district: z.enum(SURXONDARYO_DISTRICTS.map((d) => d.name) as [string, ...string[]]),
});
const suppressBody = z.object({
  kind: z.enum(['PHONE', 'TELEGRAM']),
  value: z.string().trim().min(3).max(60),
  reason: z.string().trim().min(2).max(300),
});

export function prospectRoutes(
  app: FastifyInstance,
  deps: { db: Db; prospects: ProspectService; discovery: DiscoveryService; now: () => Date },
) {
  const { db, prospects, discovery } = deps;
  const actorOf = (req: Parameters<typeof requireAuth>[0]) => ({ type: 'user' as const, id: requireAuth(req).user.id });

  app.get('/prospects', { config: { access: 'prospects.view' } }, async (req) =>
    prospects.list(parseBody(listQuery, req.query)),
  );

  app.get('/prospects/:id', { config: { access: 'prospects.view' } }, async (req) =>
    prospects.get(parseBody(idParam, req.params).id),
  );

  app.post('/prospects', { config: { access: 'prospects.edit' } }, async (req, reply) => {
    const r = await discovery.addManual(parseBody(manualBody, req.body), actorOf(req));
    return reply.code(r.action === 'created' ? 201 : 200).send(r);
  });

  app.post('/prospects/import/preview', { config: { access: 'prospects.edit' } }, async (req) =>
    discovery.previewCsv(parseBody(csvBody, req.body).csv),
  );

  app.post('/prospects/import', { config: { access: 'prospects.edit' } }, async (req) =>
    discovery.importCsv(parseBody(csvBody, req.body).csv, actorOf(req)),
  );

  app.post('/prospects/:id/stage', { config: { access: 'prospects.edit' } }, async (req) => {
    const { id } = parseBody(idParam, req.params);
    const body = parseBody(stageBody, req.body);
    const p = await prospects.moveStage(id, body.to, actorOf(req), body.reason ?? null);
    return { id: p.id, stage: p.stage };
  });

  app.post('/prospects/:id/notes', { config: { access: 'prospects.edit' } }, async (req) => {
    const { id } = parseBody(idParam, req.params);
    await prospects.updateNotes(id, parseBody(z.object({ notes: z.string().max(5000) }), req.body).notes, actorOf(req));
    return { ok: true };
  });

  app.post('/prospects/:id/contacts', { config: { access: 'prospects.edit' } }, async (req) => {
    const { id } = parseBody(idParam, req.params);
    const body = parseBody(contactBody, req.body);
    await prospects.addContact(id, body.kind, body.value, actorOf(req));
    return { ok: true };
  });

  app.post('/prospects/:id/score', { config: { access: 'prospects.edit' } }, async (req) => {
    const p = await prospects.score(parseBody(idParam, req.params).id, actorOf(req));
    return { id: p.id, score: p.score, stage: p.stage };
  });

  app.post('/contacts/:id/verify', { config: { access: 'prospects.edit' } }, async (req) => {
    const p = await prospects.verifyContact(parseBody(idParam, req.params).id, actorOf(req));
    return { id: p.id, score: p.score, stage: p.stage };
  });

  // ---- discovery ----

  app.get('/discovery', { config: { access: 'prospects.view' } }, async () => discovery.status());

  app.post('/discovery/settings', { config: { access: 'settings.manage' } }, async (req) => {
    await discovery.saveSettings(parseBody(discoverySettingsSchema, req.body), requireAuth(req).user.id);
    return { ok: true };
  });

  app.post('/discovery/firestore-import', { config: { access: 'settings.manage' } }, async (req) =>
    discovery.importFirestoreStores(actorOf(req)),
  );

  app.post('/discovery/places-search', { config: { access: 'settings.manage' } }, async (req) => {
    const body = parseBody(searchBody, req.body);
    return discovery.searchPlaces(body.query, body.district, actorOf(req));
  });

  // ---- suppression (do-not-contact list) ----

  app.get('/suppression', { config: { access: 'prospects.view' } }, async () => ({
    items: await db.suppressionRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
  }));

  app.post('/suppression', { config: { access: 'prospects.edit' } }, async (req) => {
    const body = parseBody(suppressBody, req.body);
    const value = body.kind === 'PHONE' ? normalizePhone(body.value) : normalizeTelegram(body.value);
    if (!value) throw badRequest('invalid_contact', "Aloqa ma'lumoti noto'g'ri");
    await db.suppressionRecord.upsert({
      where: { kind_value: { kind: body.kind, value } },
      create: {
        kind: body.kind,
        value,
        reason: body.reason,
        createdAt: deps.now(),
        createdById: requireAuth(req).user.id,
      },
      update: {},
    });
    // Existing prospects with this contact become DO_NOT_CONTACT immediately.
    const affected = await db.contactPoint.findMany({
      where: { kind: body.kind, value },
      select: { prospectId: true },
    });
    for (const a of affected) {
      const p = await db.prospect.findUnique({ where: { id: a.prospectId } });
      if (p && p.stage !== 'DO_NOT_CONTACT')
        await prospects.moveStage(p.id, 'DO_NOT_CONTACT', actorOf(req), body.reason);
    }
    await writeAudit(db, {
      actor: actorOf(req),
      action: 'suppression.added',
      details: { kind: body.kind, affected: affected.length },
    });
    return { ok: true, affected: affected.length };
  });
}
