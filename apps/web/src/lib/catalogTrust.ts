import { pluralizeRu } from '@/lib/pluralize';
import { sinceLabel } from '@/lib/providerCards';

// «Как на Авито»: under each catalogue card, who stands behind the machine —
// stars from reviews after completed orders, «на площадке с …», and the
// «Проверен» mark the admin sets. Only public facts about the company; no ids,
// names of reviewers or contacts.

export interface CardTrust {
  /** Average stars rounded to one decimal, null without reviews. */
  rating: number | null;
  reviews: number;
  since: string;
  verified: boolean;
  /** Лёгкий вход, данные не проверены — честная пометка вместо «Проверен». */
  provisional: boolean;
}

export interface ReviewGroup {
  companyId: string;
  _avg: { rating: number | null };
  _count: { _all: number };
}

export function cardTrust(
  company: { createdAt: Date; verified: boolean; provisional?: boolean | null },
  group: ReviewGroup | undefined,
): CardTrust {
  const reviews = group?._count._all ?? 0;
  const avg = group?._avg.rating ?? null;
  return {
    rating: reviews > 0 && avg !== null ? Math.round(avg * 10) / 10 : null,
    reviews,
    since: sinceLabel(company.createdAt),
    verified: company.verified,
    provisional: !company.verified && Boolean(company.provisional),
  };
}

/** «★ 4,8 · 12 отзывов · на площадке с октября 2026». */
export function trustLine(trust: CardTrust): string {
  const parts: string[] = [];
  if (trust.rating !== null) {
    parts.push(
      `★ ${String(trust.rating).replace('.', ',')} · ${pluralizeRu(trust.reviews, ['отзыв', 'отзыва', 'отзывов'])}`,
    );
  }
  parts.push(`на площадке ${trust.since}`);
  return parts.join(' · ');
}
