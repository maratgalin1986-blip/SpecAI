import { NextRequest, NextResponse } from 'next/server';
import { clientIp } from '@/lib/loginErrors';
import { isProvider } from '@/lib/fleet';
import { PRICE_SURVEY_RATE_LIMIT, isSurveyHoneypot, priceReportData } from '@/lib/priceReports';
import { networkKey } from '@/lib/reporterHash';
import {
  reporterHash,
  reporterLimited,
  savePriceReport,
  surveyAnswer,
} from '@/lib/priceReportStore';
import { isRateLimited, recordAttempt } from '@/lib/rateLimit';
import { getRequestUser } from '@/lib/requestUser';

export const dynamic = 'force-dynamic';

const LIMITED = 'Вы уже ответили несколько раз. Попробуйте через час';

/**
 * «Узнай цены в своём городе»: a public write for guests and signed-in people
 * (REVIEW.md §2). One answer — the kind of machinery, the city, the price per
 * hour; name, company and phone only with the consent tick. The answer is the
 * colleagues' aggregate (≥ 3 different companies or participants, the
 * reporter's own answers left out): no ids, names, phones or single prices of
 * anyone. Limited per IP (memory) and per reporter (database).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (isSurveyHoneypot(body)) {
    return NextResponse.json({ ok: true, text: 'Спасибо!', index: null }, { status: 201 });
  }
  const now = new Date();
  const parsed = priceReportData(body, now);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const user = await getRequestUser(request).catch(() => null);
  const ip = clientIp(request);
  const keys = [`price-survey:ip:${ip}`];
  if (user) keys.push(`price-survey:user:${user.id}`);
  const limited = keys
    .map((key) => isRateLimited(key, PRICE_SURVEY_RATE_LIMIT))
    .find((result) => !result.ok);
  if (limited) {
    return NextResponse.json(
      { error: LIMITED },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } },
    );
  }
  for (const key of keys) recordAttempt(key, PRICE_SURVEY_RATE_LIMIT);

  // A signed-in provider counts as his company (like his machines), a
  // signed-in person as himself on any network; a guest is limited by his
  // address and counts in the index by his network.
  const hash = isProvider(user)
    ? reporterHash('company', user.companyId)
    : user
      ? reporterHash('user', user.id)
      : reporterHash('ip', ip);
  const network = user ? null : networkKey(ip);
  try {
    if (await reporterLimited(hash, now)) {
      return NextResponse.json({ error: LIMITED }, { status: 429 });
    }
    await savePriceReport(parsed.data, 'web', hash, network);
    const answer = await surveyAnswer(
      parsed.data.categorySlug,
      { city: parsed.data.city, region: parsed.data.region },
      hash,
      isProvider(user) ? user.companyId : null,
      network,
    );
    return NextResponse.json(
      { ok: true, text: answer.text, index: answer.index, wantsOrders: parsed.data.wantsOrders },
      { status: 201 },
    );
  } catch (error) {
    console.error('[price-survey] failed', error);
    return NextResponse.json(
      { error: 'Не удалось сохранить ответ. Попробуйте позже' },
      { status: 503 },
    );
  }
}
