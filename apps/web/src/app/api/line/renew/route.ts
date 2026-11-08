import { NextRequest, NextResponse } from 'next/server';
import { clientIp } from '@/lib/loginErrors';
import { readJson } from '@/lib/apiInput';
import { checkRateLimit } from '@/lib/rateLimit';
import { renewLineByToken } from '@/lib/lineRenewData';
import { untilLong } from '@/lib/lineStanding';

export const dynamic = 'force-dynamic';

/**
 * «Продлить на 5 рабочих дней» from the reminder (lib/lineRenew.ts). A
 * public address (REVIEW.md, §2): the provider is identified by the signed
 * link from his reminder (an HMAC of his presence row and the period's end),
 * not by a session, so one tap works from Telegram or e-mail. Only that
 * period can be renewed, once. The answer is the new end date only — no id,
 * no name, no machine.
 */
export async function POST(request: NextRequest) {
  if (!checkRateLimit(`line-renew:${clientIp(request)}`, { limit: 20, windowMs: 60_000 }).ok) {
    return NextResponse.json({ error: 'Слишком часто, попробуйте через минуту' }, { status: 429 });
  }
  const body = (await readJson(request)) as { t?: unknown } | null;
  const result = await renewLineByToken(body?.t);
  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          result.reason === 'invalid'
            ? 'Ссылка недействительна. Продлите линию в разделе «На линии» после входа.'
            : 'Линия уже выключена. Включите её снова в разделе «На линии» после входа.',
      },
      { status: result.reason === 'invalid' ? 400 : 409 },
    );
  }
  return NextResponse.json({
    ok: true,
    already: result.already,
    until: result.forever ? null : untilLong(result.until, result.timeZone),
  });
}
