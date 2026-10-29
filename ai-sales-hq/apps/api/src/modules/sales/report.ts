import { startOfTashkentDay, toTashkent } from '../../domain/schedule';
import type { Db } from '../../lib/db';
import { notify } from '../notifications/service';

/**
 * Director's end-of-day report (A6: the Director summarizes; code computes every number).
 * Delivered as an in-app notification, which the owner bot forwards to Telegram.
 */
export async function dailyReport(db: Db, now: Date) {
  const from = startOfTashkentDay(now);
  const [newProspects, qualified, drafts, sent, replies, needsOwner, followUps, ai] = await Promise.all([
    db.prospect.count({ where: { discoveredAt: { gte: from } } }),
    db.prospect.count({ where: { stage: 'QUALIFIED' } }),
    db.message.count({ where: { direction: 'OUTBOUND', createdAt: { gte: from } } }),
    db.message.count({ where: { status: 'SENT_MANUALLY', sentAt: { gte: from } } }),
    db.message.count({ where: { status: 'RECEIVED', createdAt: { gte: from } } }),
    db.conversation.count({ where: { needsOwner: true } }),
    db.conversation.count({ where: { followUpAt: { lte: new Date(from.getTime() + 2 * 86_400_000) } } }),
    db.aiUsageRecord.aggregate({ where: { createdAt: { gte: from } }, _sum: { costMicroUsd: true } }),
  ]);
  const usd = Number(ai._sum.costMicroUsd ?? 0n) / 1_000_000;
  const body = [
    `Yangi mijozlar: ${newProspects} · saralanganlar jami: ${qualified}`,
    `Xabar loyihalari: ${drafts} · yuborildi: ${sent} · javoblar: ${replies}`,
    `Sizning qaroringizni kutayotgan suhbatlar: ${needsOwner}`,
    `Ertagacha qayta murojaat: ${followUps}`,
    `AI xarajati bugun: ${usd.toFixed(3)} $`,
  ].join('\n');
  const day = toTashkent(now).date;
  await notify(
    db,
    { kind: 'director.daily_report', severity: 'INFO', title: `Kunlik hisobot — ${day}`, body, link: '/' },
    now,
  );
  return { newProspects, qualified, drafts, sent, replies, needsOwner, followUps, aiUsd: usd };
}
