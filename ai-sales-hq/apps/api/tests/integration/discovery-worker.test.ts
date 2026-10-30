import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { createDb } from '../../src/lib/db';
import { AgentService } from '../../src/modules/agents/service';
import { ProspectService } from '../../src/modules/prospects/service';
import { TelegramService } from '../../src/modules/telegram/service';
import { createWorker } from '../../src/worker/setup';
import { FakeCatalogSource, FakePlaces, hasDb, resetDb } from '../helpers';

describe.skipIf(!hasDb)('market research + analyst agents in the worker (MySQL)', () => {
  const config = loadConfig(process.env);
  const db = createDb(config.DATABASE_URL);
  let clock = new Date('2026-10-28T05:00:00Z'); // Wed 10:00 Tashkent
  const now = () => clock;
  const agents = new AgentService(db, now);
  const source = new FakeCatalogSource();
  const places = new FakePlaces();
  const worker = () =>
    createWorker({
      db,
      config,
      getSource: () => source,
      places,
      telegram: new TelegramService(db, config, null, agents, now),
      now,
    });
  const owner = { type: 'user' as const, id: 'o' };

  afterAll(async () => {
    await db.$disconnect();
  });
  beforeEach(async () => {
    clock = new Date('2026-10-28T05:00:00Z');
    await resetDb(db);
    await agents.ensureAgents();
    source.stores = [{ id: 's1', name: 'Nur', phone: '+998935554433', address: 'Denov' }];
    places.results = [
      {
        placeId: 'P1',
        name: 'Korzinka',
        address: 'Termiz',
        lat: 37.2,
        lng: 67.3,
        types: ['supermarket'],
        phone: null,
        rating: 4.4,
        ratingCount: 9,
        mapsUrl: null,
      },
    ];
    places.searches = [];
  });

  it('nothing happens while the agents are not running', async () => {
    await new ProspectService(db, now).ingest({ name: 'Manual one', sourceType: 'MANUAL' }, owner);
    await worker().tick({ budgetMs: 5000 });
    expect(await db.prospect.findFirstOrThrow()).toMatchObject({ score: null });
    expect(places.searches).toHaveLength(0);
  });

  it('research imports stores and searches Places (rotating queries); the analyst scores everything', async () => {
    for (const key of ['market_research', 'business_analyst'] as const) {
      await agents.command(key, 'activate', owner);
      await agents.command(key, 'start', owner);
    }
    await worker().tick({ budgetMs: 8000 });
    clock = new Date(clock.getTime() + 60_000); // next cron minute
    await worker().tick({ budgetMs: 8000 });
    expect(places.searches[0]).toBe('supermarket Termiz Surxondaryo');
    expect(places.searches[1]).toBe('minimarket Termiz Surxondaryo');
    const prospects = await db.prospect.findMany({ orderBy: { name: 'asc' } });
    expect(prospects.map((p) => p.name)).toEqual(['Korzinka', 'Nur']);
    expect(prospects.every((p) => p.score !== null)).toBe(true);
    const audit = await db.auditLog.findFirst({ where: { action: 'prospect.stage', actorId: 'business_analyst' } });
    expect(audit).not.toBeNull();
  });
});
