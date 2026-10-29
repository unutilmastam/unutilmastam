import {
  type Category,
  canMoveProspect,
  categorize,
  DEFAULT_MATCH,
  DEFAULT_QUALIFY_THRESHOLD,
  type DedupCandidate,
  detectDistrict,
  findDuplicate,
  inSurxondaryo,
  type MatchSettings,
  normalizeBusinessName,
  normalizePhone,
  normalizeTelegram,
  type ProspectStage,
  scoreProspect,
  stageAfterScoring,
} from '../../domain/prospects';
import type { Prisma, Prospect } from '../../generated/prisma/client';
import type { SourceType } from '../../generated/prisma/enums';
import type { Db } from '../../lib/db';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors';
import { AgentService } from '../agents/service';
import { type Actor, writeAudit } from '../audit';
import { enqueue } from '../jobs/queue';

export interface IngestInput {
  name: string;
  category?: Category | null;
  placeTypes?: string[];
  district?: string | null;
  address?: string | null;
  contactPersonName?: string | null;
  lat?: number | null;
  lng?: number | null;
  phones?: (string | null | undefined)[];
  telegram?: string | null;
  placeId?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  isExistingCustomer?: boolean;
  notes?: string | null;
  // Provenance
  sourceType: SourceType;
  externalId?: string | null;
  sourceUrl?: string | null;
  evidence?: Record<string, unknown>;
  expiresAt?: Date | null;
}

export type IngestResult =
  | { action: 'created'; prospectId: string }
  | { action: 'merged'; prospectId: string; reason: string }
  | { action: 'skipped'; reason: string };

export interface ProspectFilters {
  stage?: ProspectStage;
  district?: string;
  q?: string;
  page?: number;
}

const PAGE_SIZE = 30;

export class ProspectService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
    private readonly match: () => Promise<MatchSettings & { qualifyThreshold: number }> = async () => ({
      ...DEFAULT_MATCH,
      qualifyThreshold: DEFAULT_QUALIFY_THRESHOLD,
    }),
  ) {}

  // ---------- ingest (all sources go through here) ----------

  async ingest(input: IngestInput, actor: Actor): Promise<IngestResult> {
    const name = input.name.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (name.length < 2) return { action: 'skipped', reason: 'nomi yo‘q' };
    const phones = [...new Set((input.phones ?? []).map(normalizePhone).filter((p): p is string => !!p))];
    const telegram = normalizeTelegram(input.telegram);
    const district = detectDistrict(input.district) ?? detectDistrict(input.address);
    const normalizedName = normalizeBusinessName(name);
    const hasPoint = input.lat != null && input.lng != null;
    const locationQuality = hasPoint
      ? inSurxondaryo(input.lat as number, input.lng as number)
        ? 'EXACT'
        : 'APPROXIMATE'
      : 'UNKNOWN';
    const category = input.category ?? categorize(input.placeTypes ?? [], name);
    const now = this.now();

    // Same source record seen before -> same prospect.
    let existingId: string | null = null;
    let reason = 'same_source';
    if (input.externalId) {
      const src = await this.db.prospectSource.findUnique({
        where: { sourceType_externalId: { sourceType: input.sourceType, externalId: input.externalId } },
      });
      existingId = src?.prospectId ?? null;
    }
    if (!existingId) {
      const dup = findDuplicate(
        { phones, placeId: input.placeId ?? null, normalizedName, district },
        await this.#candidates(phones, input.placeId ?? null, normalizedName, district),
        await this.match(),
      );
      if (dup) {
        existingId = dup.id;
        reason = dup.reason;
      }
    }

    const suppressed = await this.#isSuppressed(phones, telegram, input.placeId ?? null);
    const contacts = [
      ...phones.map((value) => ({ kind: 'PHONE' as const, value })),
      ...(telegram ? [{ kind: 'TELEGRAM' as const, value: telegram }] : []),
    ];

    const prospectId = await this.db.$transaction(async (tx) => {
      let id: string;
      if (existingId) {
        const cur = await tx.prospect.findUniqueOrThrow({ where: { id: existingId } });
        // Fill gaps only; values the owner typed are never overwritten by an automatic source.
        await tx.prospect.update({
          where: { id: cur.id },
          data: {
            district: cur.district ?? district,
            address: cur.address ?? input.address ?? null,
            contactPersonName: cur.contactPersonName ?? input.contactPersonName ?? null,
            lat: cur.lat ?? input.lat ?? null,
            lng: cur.lng ?? input.lng ?? null,
            locationQuality: cur.locationQuality === 'UNKNOWN' ? locationQuality : cur.locationQuality,
            googlePlaceId: cur.googlePlaceId ?? input.placeId ?? null,
            rating: input.rating ?? cur.rating,
            ratingCount: input.ratingCount ?? cur.ratingCount,
            category: cur.category === 'OTHER' ? category : cur.category,
            isExistingCustomer: cur.isExistingCustomer || !!input.isExistingCustomer,
            ...(suppressed && cur.stage !== 'DO_NOT_CONTACT' ? { stage: 'DO_NOT_CONTACT' as const } : {}),
          },
        });
        id = cur.id;
      } else {
        const created = await tx.prospect.create({
          data: {
            name,
            normalizedName,
            category,
            district,
            address: input.address ?? null,
            contactPersonName: input.contactPersonName ?? null,
            lat: input.lat ?? null,
            lng: input.lng ?? null,
            locationQuality,
            googlePlaceId: input.placeId ?? null,
            rating: input.rating ?? null,
            ratingCount: input.ratingCount ?? null,
            isExistingCustomer: !!input.isExistingCustomer,
            notes: input.notes ?? null,
            stage: suppressed ? 'DO_NOT_CONTACT' : 'NEW',
            discoveredAt: now,
          },
        });
        id = created.id;
      }
      for (const c of contacts) {
        await tx.contactPoint.upsert({
          where: { prospectId_kind_value: { prospectId: id, kind: c.kind, value: c.value } },
          create: { prospectId: id, kind: c.kind, value: c.value, sourceType: input.sourceType },
          update: {},
        });
      }
      const sourceData = {
        prospectId: id,
        sourceType: input.sourceType,
        externalId: input.externalId ?? null,
        sourceUrl: input.sourceUrl ?? null,
        observedAt: now,
        expiresAt: input.expiresAt ?? null,
        evidence: (input.evidence ?? undefined) as Prisma.InputJsonValue | undefined,
        createdById: actor.type === 'user' ? actor.id : null,
      };
      if (input.externalId) {
        await tx.prospectSource.upsert({
          where: { sourceType_externalId: { sourceType: input.sourceType, externalId: input.externalId } },
          create: sourceData,
          update: { observedAt: now, expiresAt: sourceData.expiresAt, evidence: sourceData.evidence },
        });
      } else {
        await tx.prospectSource.create({ data: sourceData });
      }
      return id;
    });

    if (!existingId) {
      await writeAudit(this.db, {
        actor,
        action: 'prospect.created',
        entityType: 'prospect',
        entityId: prospectId,
        details: { source: input.sourceType, suppressed },
      });
    }
    await this.#requestScore(prospectId);
    return existingId ? { action: 'merged', prospectId, reason } : { action: 'created', prospectId };
  }

  async #candidates(phones: string[], placeId: string | null, normalizedName: string, district: string | null) {
    const or: Prisma.ProspectWhereInput[] = [];
    if (phones.length) or.push({ contacts: { some: { kind: 'PHONE', value: { in: phones } } } });
    if (placeId) or.push({ googlePlaceId: placeId });
    if (district) or.push({ district, normalizedName });
    if (!or.length) return [];
    const rows = await this.db.prospect.findMany({
      where: { OR: or },
      include: { contacts: { where: { kind: 'PHONE' } } },
      take: 20,
    });
    return rows.map(
      (p): DedupCandidate => ({
        id: p.id,
        phones: p.contacts.map((c) => c.value),
        placeId: p.googlePlaceId,
        normalizedName: p.normalizedName,
        district: p.district,
      }),
    );
  }

  async #isSuppressed(phones: string[], telegram: string | null, placeId: string | null): Promise<boolean> {
    const or: Prisma.SuppressionRecordWhereInput[] = phones.map((value) => ({ kind: 'PHONE' as const, value }));
    if (telegram) or.push({ kind: 'TELEGRAM', value: telegram });
    if (placeId) or.push({ kind: 'PLACE', value: placeId });
    return or.length > 0 && (await this.db.suppressionRecord.count({ where: { OR: or } })) > 0;
  }

  /** The Business Analyst agent scores it when running; the key dedupes repeated requests. */
  async #requestScore(prospectId: string): Promise<void> {
    const at = this.now();
    await new AgentService(this.db, this.now).ensureAgents();
    await enqueue(
      this.db,
      {
        type: 'prospects.score',
        payload: { prospectId },
        idempotencyKey: `prospects.score:${prospectId}:${Math.floor(at.getTime() / 60_000)}`,
      },
      at,
    );
  }

  // ---------- scoring ----------

  async score(prospectId: string, actor: Actor): Promise<Prospect> {
    const p = await this.db.prospect.findUnique({ where: { id: prospectId }, include: { contacts: true } });
    if (!p) throw notFound('Mijoz topilmadi');
    const verified = p.contacts.some((c) => c.isVerified);
    const result = scoreProspect({
      category: p.category,
      district: p.district,
      hasPhone: p.contacts.some((c) => c.kind === 'PHONE'),
      hasVerifiedContact: verified,
      isExistingCustomer: p.isExistingCustomer,
      rating: p.rating === null ? null : Number(p.rating),
      ratingCount: p.ratingCount,
      locationKnown: p.locationQuality !== 'UNKNOWN',
    });
    const { qualifyThreshold } = await this.match();
    const next = stageAfterScoring(p.stage, result.score, verified, qualifyThreshold);
    const updated = await this.db.prospect.update({
      where: { id: p.id },
      data: { score: result.score, scoreReasons: result.reasons, scoredAt: this.now(), stage: next },
    });
    if (next !== p.stage) {
      await writeAudit(this.db, {
        actor,
        action: 'prospect.stage',
        entityType: 'prospect',
        entityId: p.id,
        details: { from: p.stage, to: next, reason: 'scoring', score: result.score },
      });
    }
    return updated;
  }

  // ---------- owner / staff actions ----------

  async moveStage(prospectId: string, to: ProspectStage, actor: Actor, reason: string | null): Promise<Prospect> {
    const p = await this.db.prospect.findUnique({ where: { id: prospectId }, include: { contacts: true } });
    if (!p) throw notFound('Mijoz topilmadi');
    if (!canMoveProspect(p.stage, to)) {
      throw new AppError(409, 'illegal_stage', `"${p.stage}" bosqichidan "${to}" ga o'tib bo'lmaydi`);
    }
    const res = await this.db.prospect.updateMany({ where: { id: p.id, stage: p.stage }, data: { stage: to } });
    if (res.count !== 1) throw conflict('stage_changed', "Bosqich o'zgargan — sahifani yangilang");
    if (to === 'DO_NOT_CONTACT') {
      // Opt-out suppresses every known channel of this business, now and for future imports.
      const at = this.now();
      const records = [
        { kind: 'PROSPECT' as const, value: p.id },
        ...p.contacts
          .filter((c) => c.kind === 'PHONE' || c.kind === 'TELEGRAM')
          .map((c) => ({ kind: c.kind as 'PHONE' | 'TELEGRAM', value: c.value })),
        ...(p.googlePlaceId ? [{ kind: 'PLACE' as const, value: p.googlePlaceId }] : []),
      ];
      for (const r of records) {
        await this.db.suppressionRecord.upsert({
          where: { kind_value: r },
          create: {
            ...r,
            reason: reason ?? 'Bog‘lanmaslik so‘raldi',
            createdAt: at,
            createdById: actor.type === 'user' ? actor.id : null,
          },
          update: {},
        });
      }
    }
    await writeAudit(this.db, {
      actor,
      action: 'prospect.stage',
      entityType: 'prospect',
      entityId: p.id,
      details: { from: p.stage, to, reason },
    });
    return this.db.prospect.findUniqueOrThrow({ where: { id: p.id } });
  }

  async verifyContact(contactId: string, actor: Actor) {
    const c = await this.db.contactPoint.findUnique({ where: { id: contactId } });
    if (!c) throw notFound('Aloqa topilmadi');
    const at = this.now();
    await this.db.contactPoint.update({
      where: { id: c.id },
      data: { isVerified: true, verifiedAt: at, verifiedById: actor.type === 'user' ? actor.id : null },
    });
    await this.db.prospect.update({ where: { id: c.prospectId }, data: { lastVerifiedAt: at } });
    await writeAudit(this.db, {
      actor,
      action: 'contact.verified',
      entityType: 'prospect',
      entityId: c.prospectId,
      details: { kind: c.kind },
    });
    return this.score(c.prospectId, actor);
  }

  async addContact(prospectId: string, kind: 'PHONE' | 'TELEGRAM', raw: string, actor: Actor) {
    const value = kind === 'PHONE' ? normalizePhone(raw) : normalizeTelegram(raw);
    if (!value)
      throw badRequest('invalid_contact', kind === 'PHONE' ? "Telefon raqami noto'g'ri" : "Telegram nomi noto'g'ri");
    const p = await this.db.prospect.findUnique({ where: { id: prospectId } });
    if (!p) throw notFound('Mijoz topilmadi');
    await this.db.contactPoint.upsert({
      where: { prospectId_kind_value: { prospectId, kind, value } },
      create: { prospectId, kind, value, sourceType: 'MANUAL' },
      update: {},
    });
    await writeAudit(this.db, {
      actor,
      action: 'contact.added',
      entityType: 'prospect',
      entityId: prospectId,
      details: { kind },
    });
  }

  async updateNotes(prospectId: string, notes: string, actor: Actor) {
    const p = await this.db.prospect.findUnique({ where: { id: prospectId } });
    if (!p) throw notFound('Mijoz topilmadi');
    await this.db.prospect.update({ where: { id: prospectId }, data: { notes: notes.slice(0, 5000) } });
    await writeAudit(this.db, { actor, action: 'prospect.notes', entityType: 'prospect', entityId: prospectId });
  }

  // ---------- reading ----------

  async list(f: ProspectFilters) {
    const where: Prisma.ProspectWhereInput = {
      ...(f.stage ? { stage: f.stage } : {}),
      ...(f.district ? { district: f.district } : {}),
      ...(f.q ? { OR: [{ name: { contains: f.q } }, { address: { contains: f.q } }] } : {}),
    };
    const page = Math.max(1, f.page ?? 1);
    const [total, rows] = await Promise.all([
      this.db.prospect.count({ where }),
      this.db.prospect.findMany({
        where,
        orderBy: [{ score: { sort: 'desc', nulls: 'last' } }, { discoveredAt: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { contacts: true, sources: { select: { sourceType: true } } },
      }),
    ]);
    return {
      total,
      page,
      pageSize: PAGE_SIZE,
      items: rows.map((p) => ({
        ...this.#dto(p),
        contacts: p.contacts.map((c) => ({ id: c.id, kind: c.kind, value: c.value, isVerified: c.isVerified })),
        sources: [...new Set(p.sources.map((s) => s.sourceType))],
      })),
    };
  }

  async get(id: string) {
    const p = await this.db.prospect.findUnique({
      where: { id },
      include: { contacts: { orderBy: { createdAt: 'asc' } }, sources: { orderBy: { observedAt: 'desc' } } },
    });
    if (!p) throw notFound('Mijoz topilmadi');
    const history = await this.db.auditLog.findMany({
      where: { entityType: 'prospect', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      ...this.#dto(p),
      notes: p.notes,
      contactPersonName: p.contactPersonName,
      contacts: p.contacts,
      sources: p.sources,
      history: history.map((h) => ({ ...h, id: Number(h.id) })),
    };
  }

  #dto(p: Prospect) {
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      district: p.district,
      address: p.address,
      lat: p.lat === null ? null : Number(p.lat),
      lng: p.lng === null ? null : Number(p.lng),
      locationQuality: p.locationQuality,
      rating: p.rating === null ? null : Number(p.rating),
      ratingCount: p.ratingCount,
      stage: p.stage,
      isExistingCustomer: p.isExistingCustomer,
      score: p.score,
      scoreReasons: p.scoreReasons,
      scoredAt: p.scoredAt,
      discoveredAt: p.discoveredAt,
      lastVerifiedAt: p.lastVerifiedAt,
    };
  }
}
