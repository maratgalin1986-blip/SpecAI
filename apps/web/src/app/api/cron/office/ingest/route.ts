import { NextRequest, NextResponse } from 'next/server';
import { cronAllowed } from '@/lib/cronAuth';
import { ingestScheduledStep } from '@/lib/office/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
/** Больше — не ответ Overpass по одному городу (проба 10.11.2026: 1045 объектов — 336 КБ). */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * Ответ Overpass от раннера GitHub по шагу из /api/cron/office/next: `?index=N&key=K`, тело —
 * сырой JSON Overpass или `{"error":"…"}`, когда ни одно зеркало не ответило (шаг уходит в
 * журнал отказом). Разбор и создание кандидатов — здесь, на сервере. В ответе только числа и
 * текст ошибки из журнала: ни названий, ни телефонов, ни идентификаторов.
 */
export async function POST(request: NextRequest) {
  if (!cronAllowed(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const params = request.nextUrl.searchParams;
  const indexRaw = params.get('index') ?? '';
  const key = params.get('key') ?? '';
  if (!/^\d{1,6}$/.test(indexRaw) || !/^[0-9a-f]{16}$/.test(key)) {
    return NextResponse.json({ error: 'bad step' }, { status: 400 });
  }
  const tooLarge = () => NextResponse.json({ error: 'too large' }, { status: 413 });
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) return tooLarge();
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return tooLarge();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const failure = (body as { error?: unknown; elements?: unknown }).error;
  const isFailure =
    typeof failure === 'string' && (body as { elements?: unknown }).elements === undefined;
  const outcome = await ingestScheduledStep({
    index: Number(indexRaw),
    key,
    // `retry: true` — раннер не достучался ни до одного зеркала: курсор плана не двигается.
    ...(isFailure
      ? { error: failure, retry: (body as { retry?: unknown }).retry === true }
      : { overpass: body }),
  });
  if (outcome.status === 'stale') return NextResponse.json({ error: 'stale' }, { status: 409 });
  const { found, created, skipped, error } = outcome.result;
  return NextResponse.json({ found, created, skipped, error });
}
