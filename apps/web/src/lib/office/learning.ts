// Самообучение офиса (S15): какой заход персонального предложения работает лучше. По каждому
// заходу считаем: отправлено → открыли превью → ответили → согласились. При следующем письме
// из подходящих фирме заходов выбирается лучший по этим числам, но с долей проб: новые
// заходы сначала получают свои первые письма, и каждый пятый раз офис пробует не лидера,
// чтобы не застрять на случайном везении первых дней.

import { OFFER_ANGLES, type OfferAngle } from './offer';

export interface AngleStat {
  angle: OfferAngle;
  sent: number;
  opened: number;
  replied: number;
  agreed: number;
}

/** Пока у захода меньше стольких писем — он «новый» и получает письма в первую очередь. */
export const MIN_TRIALS = 5;
/** Доля писем на пробу не лидера. */
export const EXPLORE_RATE = 0.2;

/**
 * Оценка захода: ответ весит больше открытия, согласие — больше ответа; сглаживание
 * (+1 / +2), чтобы один случайный ответ на одно письмо не делал заход «лучшим навсегда».
 */
export function angleScore(s: Pick<AngleStat, 'sent' | 'opened' | 'replied' | 'agreed'>): number {
  const value = s.opened + 3 * s.replied + 10 * s.agreed;
  return (value + 1) / (s.sent + 2);
}

/**
 * Выбор захода: сначала недоиспытанные (меньше MIN_TRIALS писем; из них — с наименьшим числом),
 * иначе с вероятностью EXPLORE_RATE — случайный из остальных, иначе лучший по angleScore.
 * `random` — для тестов; по умолчанию Math.random.
 */
export function chooseAngle(
  applicable: readonly OfferAngle[],
  stats: ReadonlyMap<OfferAngle, AngleStat>,
  random: () => number = Math.random,
): OfferAngle {
  const first = applicable[0];
  if (!first) return 'leads_to_email';
  const stat = (a: OfferAngle): AngleStat =>
    stats.get(a) ?? { angle: a, sent: 0, opened: 0, replied: 0, agreed: 0 };
  const fresh = applicable.filter((a) => stat(a).sent < MIN_TRIALS);
  if (fresh.length) {
    return fresh.reduce((best, a) => (stat(a).sent < stat(best).sent ? a : best), fresh[0]!);
  }
  const ranked = [...applicable].sort((a, b) => angleScore(stat(b)) - angleScore(stat(a)));
  const leader = ranked[0]!;
  if (ranked.length > 1 && random() < EXPLORE_RATE) {
    const others = ranked.slice(1);
    return others[Math.min(others.length - 1, Math.floor(random() * others.length))]!;
  }
  return leader;
}

/** Ровно те запросы, что нужны для статистики (prisma подходит структурно). */
export interface LearningDb {
  prospect: {
    groupBy(args: {
      by: ['offerAngle'];
      where: Record<string, unknown>;
      _count: { _all: true };
    }): Promise<{ offerAngle: string | null; _count: { _all: number } }[]>;
  };
}

const isAngle = (v: string | null): v is OfferAngle =>
  v !== null && (OFFER_ANGLES as readonly string[]).includes(v);

/** Статистика по заходам из базы: четыре группировки по `offerAngle`. */
export async function collectAngleStats(
  db: LearningDb,
  kind: 'site' | 'provider' = 'site',
): Promise<Map<OfferAngle, AngleStat>> {
  const base = { kind, offerAngle: { not: null }, contactedAt: { not: null } };
  const [sent, opened, replied, agreed] = await Promise.all([
    db.prospect.groupBy({ by: ['offerAngle'], where: base, _count: { _all: true } }),
    db.prospect.groupBy({
      by: ['offerAngle'],
      where: { ...base, previewViews: { gt: 0 } },
      _count: { _all: true },
    }),
    db.prospect.groupBy({
      by: ['offerAngle'],
      where: { ...base, repliedAt: { not: null } },
      _count: { _all: true },
    }),
    db.prospect.groupBy({
      by: ['offerAngle'],
      where: { ...base, agreedAt: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const out = new Map<OfferAngle, AngleStat>();
  const add = (rows: typeof sent, field: keyof Omit<AngleStat, 'angle'>) => {
    for (const row of rows) {
      if (!isAngle(row.offerAngle)) continue;
      const s = out.get(row.offerAngle) ?? {
        angle: row.offerAngle,
        sent: 0,
        opened: 0,
        replied: 0,
        agreed: 0,
      };
      s[field] = row._count._all;
      out.set(row.offerAngle, s);
    }
  };
  add(sent, 'sent');
  add(opened, 'opened');
  add(replied, 'replied');
  add(agreed, 'agreed');
  return out;
}

/** Таблица для админки и сводки: все заходы, лучший первым; доли — от отправленных. */
export function learningTable(stats: ReadonlyMap<OfferAngle, AngleStat>): (AngleStat & {
  openRate: number;
  replyRate: number;
  score: number;
})[] {
  return OFFER_ANGLES.map(
    (a) => stats.get(a) ?? { angle: a, sent: 0, opened: 0, replied: 0, agreed: 0 },
  )
    .map((s) => ({
      ...s,
      openRate: s.sent ? s.opened / s.sent : 0,
      replyRate: s.sent ? s.replied / s.sent : 0,
      score: angleScore(s),
    }))
    .sort((a, b) => b.score - a.score || b.sent - a.sent);
}
