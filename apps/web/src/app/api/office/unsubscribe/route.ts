import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { clientIp } from '@/lib/loginErrors';
import { optOutByToken, verifyUnsubscribe } from '@/lib/office/unsubscribe';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/** Тело запроса — пара коротких полей; больше не читаем. */
const MAX_BODY_LENGTH = 2_000;

const INVALID = 'Ссылка недействительна. Ответьте на письмо словом «стоп» — больше не напишем.';

/**
 * «Больше не писать» из холодного письма офиса (К3, lib/office/unsubscribe.ts). Публичный адрес
 * (REVIEW.md § 2): компанию узнаём по подписанной ссылке из письма (токен превью и HMAC), не по
 * входу. Почтовые клиенты шлют сюда POST `List-Unsubscribe=One-Click` (RFC 8058) с `t` и `s` в
 * адресе; страница /otpiska/<token> — POST после кнопки с `{ t, s }` в теле. Лимит по IP — на
 * неверные ссылки (верная подписанная ссылка работает всегда). Ответ — только `{ ok: true }` или
 * текст ошибки, без id, названия и адреса.
 */
export async function POST(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const fromBody = query.get('t') ? null : await readBody(request);
  const token = query.get('t') ?? fromBody?.t ?? null;
  const signature = query.get('s') ?? fromBody?.s ?? null;

  if (!token || !verifyUnsubscribe(token, signature)) {
    if (!checkRateLimit(`office-optout:${clientIp(request)}`, { limit: 30, windowMs: 60_000 }).ok) {
      return NextResponse.json(
        { error: 'Слишком часто, попробуйте через минуту' },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: INVALID }, { status: 400 });
  }
  try {
    // Строки уже нет (удалили по просьбе) — для почтового клиента это тоже успех.
    await optOutByToken(token, new Date(), prisma);
  } catch (error) {
    console.error('[office] opt-out failed', error);
    return NextResponse.json(
      { error: 'Не получилось сохранить, попробуйте ещё раз через минуту' },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true });
}

/** Открытая в браузере ссылка ведёт на страницу с кнопкой; GET ничего не меняет (сканеры ссылок). */
export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t') ?? '';
  const signature = request.nextUrl.searchParams.get('s') ?? '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(token)) {
    return NextResponse.redirect(new URL('/', request.nextUrl.origin), 303);
  }
  const target = new URL(`/otpiska/${token}`, request.nextUrl.origin);
  if (signature) target.searchParams.set('s', signature);
  return NextResponse.redirect(target, 303);
}

async function readBody(request: NextRequest): Promise<{ t?: string; s?: string } | null> {
  const type = request.headers.get('content-type') ?? '';
  try {
    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY_LENGTH) return null;
    if (type.includes('application/json')) {
      const body = JSON.parse(raw) as { t?: unknown; s?: unknown } | null;
      return {
        ...(typeof body?.t === 'string' ? { t: body.t } : {}),
        ...(typeof body?.s === 'string' ? { s: body.s } : {}),
      };
    }
    if (type.includes('form')) {
      const form = new URLSearchParams(raw);
      return {
        ...(form.get('t') ? { t: form.get('t')! } : {}),
        ...(form.get('s') ? { s: form.get('s')! } : {}),
      };
    }
  } catch {
    return null;
  }
  return null;
}
