import { NextRequest, NextResponse } from 'next/server';
import { cronAllowed } from '@/lib/cronAuth';
import { peekScheduledStep, relayRequest } from '@/lib/office/run';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Следующий шаг плана для раннера GitHub (.github/scripts/office-relay.sh): Overpass с Vercel
 * не отвечает, поэтому раннер получает здесь готовый запрос и зеркала, сам спрашивает Overpass
 * и присылает ответ в /api/cron/office/ingest. Курсор плана не двигается. В ответе — только
 * шаг плана (агент, ниша, город) и текст запроса: ни компаний, ни телефонов, ни токенов.
 */
export async function GET(request: NextRequest) {
  if (!cronAllowed(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const peeked = await peekScheduledStep();
  if ('skipped' in peeked) return NextResponse.json({ skipped: peeked.skipped });
  const { query, mirrors } = relayRequest(peeked.step);
  return NextResponse.json({
    index: peeked.index,
    key: peeked.key,
    step: { agent: peeked.step.agent, niche: peeked.step.niche, city: peeked.step.city },
    query,
    mirrors,
  });
}
