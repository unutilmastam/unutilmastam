import { z } from 'zod';
import type { Category } from '../../domain/prospects';
import {
  type CatalogItem,
  cooldownLeftDays,
  costMicroUsd,
  maskPersonalData,
  needsOwnerDecision,
  productLine,
  qualityGate,
  recommendProducts,
  templateEscalationReply,
  templateOutreach,
} from '../../domain/sales';
import { startOfTashkentDay } from '../../domain/schedule';
import type { Channel, ContactOutcome } from '../../generated/prisma/enums';
import { AiRefusedError, type DraftRequest } from '../../integrations/ai';
import type { Db } from '../../lib/db';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors';
import { redactText } from '../../lib/logger';
import { type Actor, writeAudit } from '../audit';
import { markIntegration } from '../integrations/service';
import { notify } from '../notifications/service';
import type { ProspectService } from '../prospects/service';

import { type Drafters, INTEGRATION_AI } from './ai-provider';

export { INTEGRATION_AI };

export const salesSettingsSchema = z.object({
  cooldownDays: z.number().int().min(1).max(90),
  dailyDraftLimit: z.number().int().min(0).max(500),
  signature: z.string().trim().min(2).max(80),
  language: z.enum(['uz', 'ru']),
  aiEnabled: z.boolean(),
  aiDailyBudgetUsd: z.number().min(0).max(100),
});
export type SalesSettings = z.infer<typeof salesSettingsSchema>;
export const DEFAULT_SALES: SalesSettings = {
  cooldownDays: 7,
  dailyDraftLimit: 20,
  signature: "Unutilmas Ta'm",
  language: 'uz',
  aiEnabled: true,
  aiDailyBudgetUsd: 1,
};

/** Raised when the AI budget for today is spent; the agent pauses with BUDGET_EXCEEDED (A6). */
export class AiBudgetExceededError extends Error {}

const CONTACTABLE = ['QUALIFIED', 'CONTACT_PENDING', 'CONTACTED', 'INTERESTED', 'NEGOTIATION'] as const;

export class SalesService {
  constructor(
    private readonly db: Db,
    private readonly prospects: ProspectService,
    // Resolved per call: a key saved in the app takes effect without a restart (D-017).
    private readonly drafters: () => Promise<Drafters>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async settings(): Promise<SalesSettings> {
    const row = await this.db.systemSetting.findUnique({ where: { key: 'sales' } });
    const parsed = salesSettingsSchema.safeParse(row?.value);
    return parsed.success ? parsed.data : DEFAULT_SALES;
  }

  async saveSettings(s: SalesSettings, actorUserId: string) {
    await this.db.systemSetting.upsert({
      where: { key: 'sales' },
      create: { key: 'sales', value: s, updatedById: actorUserId },
      update: { value: s, updatedById: actorUserId },
    });
    await writeAudit(this.db, { actor: { type: 'user', id: actorUserId }, action: 'sales.settings', details: s });
  }

  // ---------- catalog facts the drafts may use ----------

  /** Only CONFIRMED prices reach a draft (MASTER_SPEC §13, D-005). */
  async #catalog(): Promise<CatalogItem[]> {
    const rows = await this.db.product.findMany({
      where: { isActive: true },
      include: { prices: { where: { validTo: null, status: 'CONFIRMED' } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((p) => ({
      name: p.name,
      grams: p.packageWeightGrams,
      retailSom: Number(p.prices.find((x) => x.priceType === 'RETAIL')?.amount ?? Number.NaN) || null,
      wholesaleSom: Number(p.prices.find((x) => x.priceType === 'WHOLESALE')?.amount ?? Number.NaN) || null,
    }));
  }

  #allowedPrices(items: CatalogItem[]): Set<number> {
    return new Set(items.flatMap((i) => [i.retailSom, i.wholesaleSom]).filter((n): n is number => n !== null));
  }

  async aiSpentTodayMicroUsd(): Promise<bigint> {
    const agg = await this.db.aiUsageRecord.aggregate({
      where: { createdAt: { gte: startOfTashkentDay(this.now()) } },
      _sum: { costMicroUsd: true },
    });
    return agg._sum.costMicroUsd ?? 0n;
  }

  /** AI phrasing with budget and usage accounting; null means "use the template". */
  async #aiText(req: DraftRequest, opts: { strong?: boolean; agentKey: string | null; jobId?: string }) {
    const s = await this.settings();
    const drafters = await this.drafters();
    const drafter = opts.strong ? drafters.strong : drafters.fast;
    if (!drafter || !s.aiEnabled) return null;
    if ((await this.aiSpentTodayMicroUsd()) >= BigInt(Math.round(s.aiDailyBudgetUsd * 1_000_000))) {
      throw new AiBudgetExceededError(`Bugungi AI byudjeti tugadi (${s.aiDailyBudgetUsd} $)`);
    }
    const record = (ok: boolean, model: string, input: number, output: number, error: string | null) =>
      this.db.aiUsageRecord.create({
        data: {
          provider: drafter.provider,
          model,
          purpose: req.purpose,
          agentKey: opts.agentKey,
          jobId: opts.jobId ?? null,
          inputTokens: input,
          outputTokens: output,
          costMicroUsd: costMicroUsd(model, input, output),
          ok,
          error,
          createdAt: this.now(),
        },
      });
    try {
      const r = await drafter.draft(req);
      await record(true, r.model, r.inputTokens, r.outputTokens, null);
      await markIntegration(this.db, INTEGRATION_AI, { ok: true, at: this.now() });
      return r;
    } catch (err) {
      const message = redactText(err instanceof Error ? err.message : String(err)).slice(0, 300);
      await record(false, drafter.model, 0, 0, message);
      if (!(err instanceof AiRefusedError))
        await markIntegration(this.db, INTEGRATION_AI, { ok: false, error: message, at: this.now() });
      return null; // the template still works; the failure is visible in the integration status
    }
  }

  async #conversation(prospectId: string) {
    return this.db.conversation.upsert({ where: { prospectId }, create: { prospectId }, update: {} });
  }

  async #assertContactable(prospectId: string) {
    const p = await this.db.prospect.findUnique({ where: { id: prospectId }, include: { contacts: true } });
    if (!p) throw notFound('Mijoz topilmadi');
    if (p.stage === 'DO_NOT_CONTACT') throw new AppError(409, 'suppressed', "Bu mijoz bog'lanmaslik ro'yxatida");
    // A9: suppression applies to every channel, including assisted-manual.
    const values = p.contacts.map((c) => c.value);
    const suppressed = await this.db.suppressionRecord.count({
      where: { OR: [{ kind: 'PROSPECT', value: p.id }, ...(values.length ? [{ value: { in: values } }] : [])] },
    });
    if (suppressed) throw new AppError(409, 'suppressed', "Bu mijoz bog'lanmaslik ro'yxatida");
    return p;
  }

  // ---------- drafting ----------

  async draftOutreach(prospectId: string, actor: Actor, opts: { strong?: boolean; jobId?: string } = {}) {
    const p = await this.#assertContactable(prospectId);
    if (!(CONTACTABLE as readonly string[]).includes(p.stage)) {
      throw new AppError(409, 'not_qualified', 'Avval mijozni saralang (bosqich: Saralangan)');
    }
    if (!p.contacts.some((c) => c.kind === 'PHONE' || c.kind === 'TELEGRAM')) {
      throw new AppError(409, 'no_contact', "Telefon yoki Telegram yo'q");
    }
    const conv = await this.#conversation(p.id);
    const open = await this.db.message.findFirst({
      where: { conversationId: conv.id, direction: 'OUTBOUND', status: { in: ['DRAFT', 'NEEDS_EDIT'] } },
    });
    if (open) return open; // idempotent: one open draft per prospect
    const s = await this.settings();
    const left = cooldownLeftDays(conv.lastContactAt, this.now(), s.cooldownDays);
    if (left > 0) throw new AppError(409, 'cooldown', `Bu mijozga ${left} kundan keyin qayta yozish mumkin`);
    const today = await this.db.message.count({
      where: { direction: 'OUTBOUND', createdAt: { gte: startOfTashkentDay(this.now()) } },
    });
    if (today >= s.dailyDraftLimit)
      throw new AppError(429, 'daily_limit', `Kunlik loyiha limiti tugadi (${s.dailyDraftLimit})`);

    const catalog = await this.#catalog();
    const products = recommendProducts(p.category as Category, catalog);
    const agentKey = actor.type === 'worker' ? (actor.id ?? null) : null;
    const ai = await this.#aiText(
      {
        purpose: 'outreach',
        businessName: p.name,
        category: p.category,
        district: p.district,
        productLines: products.map(productLine),
        signature: s.signature,
        language: s.language,
      },
      { strong: opts.strong, agentKey, jobId: opts.jobId },
    );
    const body = ai?.text ?? templateOutreach(p.name, products, s.signature);
    const issues = qualityGate(body, this.#allowedPrices(catalog));
    const msg = await this.db.message.create({
      data: {
        conversationId: conv.id,
        direction: 'OUTBOUND',
        body,
        language: ai?.language ?? s.language,
        status: issues.length ? 'NEEDS_EDIT' : 'DRAFT',
        checks: issues.length ? issues : undefined,
        agentKey,
        generatedBy: ai ? ai.model : 'template',
        createdById: actor.type === 'user' ? actor.id : null,
        createdAt: this.now(),
      },
    });
    if (p.stage === 'QUALIFIED') await this.prospects.moveStage(p.id, 'CONTACT_PENDING', actor, 'draft');
    await writeAudit(this.db, {
      actor,
      action: 'message.drafted',
      entityType: 'prospect',
      entityId: p.id,
      details: { messageId: msg.id, generatedBy: msg.generatedBy, issues: issues.length },
    });
    return msg;
  }

  async suggestReply(prospectId: string, actor: Actor, opts: { strong?: boolean } = {}) {
    const p = await this.#assertContactable(prospectId);
    const conv = await this.#conversation(p.id);
    // Event time: when an outbound message was actually sent, not when its draft was written.
    const history = (
      await this.db.message.findMany({
        where: { conversationId: conv.id, status: { in: ['SENT_MANUALLY', 'RECEIVED'] } },
      })
    ).sort((a, b) => (a.sentAt ?? a.createdAt).getTime() - (b.sentAt ?? b.createdAt).getTime());
    const lastIn = [...history].reverse().find((m) => m.direction === 'INBOUND');
    if (!lastIn) throw badRequest('no_inbound', 'Mijozning javobi hali kiritilmagan');
    const s = await this.settings();
    const catalog = await this.#catalog();
    let body: string;
    let generatedBy = 'template';
    if (needsOwnerDecision(lastIn.body)) {
      // Special terms are never negotiated by the AI (MASTER_SPEC §13): hand over to the owner.
      body = templateEscalationReply(s.signature);
    } else {
      const ai = await this.#aiText(
        {
          purpose: 'reply',
          businessName: p.name,
          category: p.category,
          district: p.district,
          productLines: recommendProducts(p.category as Category, catalog).map(productLine),
          signature: s.signature,
          language: s.language,
          history: history.map((m) => ({ direction: m.direction, body: maskPersonalData(m.body) })),
        },
        { strong: opts.strong, agentKey: null },
      );
      body = ai?.text ?? templateEscalationReply(s.signature);
      generatedBy = ai?.model ?? 'template';
    }
    await this.db.message.updateMany({
      where: { conversationId: conv.id, direction: 'OUTBOUND', status: { in: ['DRAFT', 'NEEDS_EDIT'] } },
      data: { status: 'DISCARDED' },
    });
    const issues = qualityGate(body, this.#allowedPrices(catalog));
    return this.db.message.create({
      data: {
        conversationId: conv.id,
        direction: 'OUTBOUND',
        body,
        language: s.language,
        status: issues.length ? 'NEEDS_EDIT' : 'DRAFT',
        checks: issues.length ? issues : undefined,
        generatedBy,
        createdById: actor.type === 'user' ? actor.id : null,
        createdAt: this.now(),
      },
    });
  }

  async editDraft(messageId: string, body: string, actor: Actor) {
    const m = await this.db.message.findUnique({ where: { id: messageId } });
    if (m?.direction !== 'OUTBOUND') throw notFound('Xabar topilmadi');
    if (m.status !== 'DRAFT' && m.status !== 'NEEDS_EDIT')
      throw conflict('not_draft', 'Bu xabar allaqachon yuborilgan');
    const issues = qualityGate(body, this.#allowedPrices(await this.#catalog()));
    const updated = await this.db.message.update({
      where: { id: m.id },
      data: { body: body.trim(), status: issues.length ? 'NEEDS_EDIT' : 'DRAFT', checks: issues.length ? issues : [] },
    });
    await writeAudit(this.db, {
      actor,
      action: 'message.edited',
      entityType: 'message',
      entityId: m.id,
      details: { issues: issues.length },
    });
    return updated;
  }

  async discard(messageId: string, actor: Actor) {
    const res = await this.db.message.updateMany({
      where: { id: messageId, status: { in: ['DRAFT', 'NEEDS_EDIT'] } },
      data: { status: 'DISCARDED' },
    });
    if (res.count !== 1) throw conflict('not_draft', 'Bu xabarni bekor qilib bo‘lmaydi');
    await writeAudit(this.db, { actor, action: 'message.discarded', entityType: 'message', entityId: messageId });
  }

  // ---------- owner's manual actions (A5 assisted manual) ----------

  /** The owner sent the draft himself (tel:/sms:/Telegram) and confirms it here. */
  async markSent(messageId: string, channel: Channel, actor: Actor) {
    const m = await this.db.message.findUnique({ where: { id: messageId }, include: { conversation: true } });
    if (m?.direction !== 'OUTBOUND') throw notFound('Xabar topilmadi');
    if (m.status === 'NEEDS_EDIT') throw conflict('needs_edit', 'Avval xabarni tuzating — tekshiruvdan o‘tmagan');
    if (m.status !== 'DRAFT') throw conflict('not_draft', 'Bu xabar allaqachon yuborilgan');
    const p = await this.#assertContactable(m.conversation.prospectId);
    const at = this.now();
    await this.db.$transaction(async (tx) => {
      await tx.message.update({
        where: { id: m.id },
        data: { status: 'SENT_MANUALLY', channel, sentAt: at, approvedById: actor.type === 'user' ? actor.id : null },
      });
      await tx.conversation.update({ where: { id: m.conversationId }, data: { lastContactAt: at } });
    });
    if (p.stage === 'QUALIFIED') await this.prospects.moveStage(p.id, 'CONTACT_PENDING', actor, 'sent');
    const fresh = await this.db.prospect.findUniqueOrThrow({ where: { id: p.id } });
    if (fresh.stage === 'CONTACT_PENDING') await this.prospects.moveStage(p.id, 'CONTACTED', actor, channel);
    await writeAudit(this.db, {
      actor,
      action: 'message.sent_manually',
      entityType: 'prospect',
      entityId: p.id,
      details: { channel },
    });
  }

  async recordInbound(prospectId: string, body: string, channel: Channel, actor: Actor) {
    const p = await this.db.prospect.findUnique({ where: { id: prospectId } });
    if (!p) throw notFound('Mijoz topilmadi');
    const conv = await this.#conversation(p.id);
    const needsOwner = needsOwnerDecision(body);
    await this.db.message.create({
      data: {
        conversationId: conv.id,
        direction: 'INBOUND',
        channel,
        body: body.trim().slice(0, 4000),
        status: 'RECEIVED',
        createdById: actor.type === 'user' ? actor.id : null,
        createdAt: this.now(),
      },
    });
    if (needsOwner) {
      await this.db.conversation.update({
        where: { id: conv.id },
        data: { needsOwner: true, needsOwnerWhy: 'Mijoz narx yoki shartlar haqida so‘radi' },
      });
      await notify(
        this.db,
        {
          kind: 'sales.needs_owner',
          severity: 'WARNING',
          title: `${p.name}: egasining qarori kerak`,
          body: 'Mijoz narx, chegirma yoki shartlar haqida so‘radi. Agent bu masalani hal qilmaydi.',
          link: `/prospects/view/?id=${p.id}`,
          dedupeKey: `needs-owner-${p.id}`,
        },
        this.now(),
      );
    }
    await writeAudit(this.db, {
      actor,
      action: 'message.inbound',
      entityType: 'prospect',
      entityId: p.id,
      details: { needsOwner },
    });
    return { needsOwner };
  }

  async recordOutcome(
    prospectId: string,
    outcome: ContactOutcome,
    actor: Actor,
    opts: { followUpAt?: Date; note?: string } = {},
  ) {
    const p = await this.db.prospect.findUnique({ where: { id: prospectId } });
    if (!p) throw notFound('Mijoz topilmadi');
    const conv = await this.#conversation(p.id);
    const day = 86_400_000;
    const at = this.now();
    if (outcome === 'DO_NOT_CONTACT') {
      await this.prospects.moveStage(p.id, 'DO_NOT_CONTACT', actor, opts.note ?? 'Mijoz so‘radi');
    } else if (outcome === 'NOT_INTERESTED') {
      await this.prospects.moveStage(p.id, 'LOST', actor, opts.note ?? 'Qiziqmadi');
    } else if (outcome === 'INTERESTED' && p.stage === 'CONTACTED') {
      await this.prospects.moveStage(p.id, 'INTERESTED', actor, opts.note ?? null);
    }
    const followUpAt =
      outcome === 'NO_ANSWER'
        ? (opts.followUpAt ?? new Date(at.getTime() + 2 * day))
        : outcome === 'CALL_BACK'
          ? (opts.followUpAt ?? new Date(at.getTime() + day))
          : null;
    await this.db.conversation.update({
      where: { id: conv.id },
      data: {
        followUpAt,
        ...(outcome === 'DO_NOT_CONTACT' || outcome === 'NOT_INTERESTED' ? { needsOwner: false } : {}),
      },
    });
    await writeAudit(this.db, {
      actor,
      action: 'contact.outcome',
      entityType: 'prospect',
      entityId: p.id,
      details: { outcome },
    });
  }

  async resolveNeedsOwner(prospectId: string, actor: Actor) {
    await this.db.conversation.updateMany({ where: { prospectId }, data: { needsOwner: false, needsOwnerWhy: null } });
    await writeAudit(this.db, { actor, action: 'sales.owner_resolved', entityType: 'prospect', entityId: prospectId });
  }

  // ---------- reading ----------

  async conversation(prospectId: string) {
    const conv = await this.db.conversation.findUnique({
      where: { prospectId },
      include: { messages: { where: { status: { not: 'DISCARDED' } }, orderBy: { createdAt: 'asc' } } },
    });
    const s = await this.settings();
    conv?.messages.sort((a, b) => (a.sentAt ?? a.createdAt).getTime() - (b.sentAt ?? b.createdAt).getTime());
    return {
      conversation: conv,
      cooldownLeftDays: cooldownLeftDays(conv?.lastContactAt ?? null, this.now(), s.cooldownDays),
    };
  }

  /** The owner's outreach desk: drafts to send, follow-ups due, conversations waiting for him. */
  async desk() {
    const now = this.now();
    const [drafts, followUps, needsOwner] = await Promise.all([
      this.db.message.findMany({
        where: { direction: 'OUTBOUND', status: { in: ['DRAFT', 'NEEDS_EDIT'] } },
        orderBy: { createdAt: 'asc' },
        take: 50,
        include: { conversation: true },
      }),
      this.db.conversation.findMany({ where: { followUpAt: { lte: now } }, orderBy: { followUpAt: 'asc' }, take: 50 }),
      this.db.conversation.findMany({ where: { needsOwner: true }, take: 50 }),
    ]);
    const ids = [
      ...new Set([
        ...drafts.map((d) => d.conversation.prospectId),
        ...followUps.map((c) => c.prospectId),
        ...needsOwner.map((c) => c.prospectId),
      ]),
    ];
    const prospects = await this.db.prospect.findMany({ where: { id: { in: ids } }, include: { contacts: true } });
    const byId = new Map(prospects.map((p) => [p.id, p]));
    const card = (prospectId: string) => {
      const p = byId.get(prospectId);
      if (!p) return null;
      return {
        id: p.id,
        name: p.name,
        stage: p.stage,
        district: p.district,
        contacts: p.contacts.map((c) => ({ id: c.id, kind: c.kind, value: c.value, isVerified: c.isVerified })),
      };
    };
    const [spent, s] = await Promise.all([this.aiSpentTodayMicroUsd(), this.settings()]);
    return {
      drafts: drafts.map((d) => ({
        message: { ...d, conversation: undefined },
        prospect: card(d.conversation.prospectId),
      })),
      followUps: followUps.map((c) => ({ followUpAt: c.followUpAt, prospect: card(c.prospectId) })),
      needsOwner: needsOwner.map((c) => ({ why: c.needsOwnerWhy, prospect: card(c.prospectId) })),
      ai: {
        configured: !!(await this.drafters()).fast,
        enabled: s.aiEnabled,
        spentTodayUsd: Number(spent) / 1_000_000,
        budgetUsd: s.aiDailyBudgetUsd,
      },
      settings: s,
    };
  }
}
