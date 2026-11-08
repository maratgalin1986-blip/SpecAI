import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/requestUser';
import { INVALID_JSON_MESSAGE, readJson } from '@/lib/apiInput';
import { canAnswerPriceAsk } from '@/lib/aktualno';
import { priceAskEnabled, setPriceAsk } from '@/lib/aktualnoData';

export const dynamic = 'force-dynamic';

/**
 * The weekly «обновите цены и свободные дни» switch of the signed-in user
 * (site — session, app — Bearer). Only provider managers of companies other
 * than the house fleet get the message; for everyone else `available: false`
 * and the switch is not shown.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  if (!canAnswerPriceAsk(user)) return NextResponse.json({ available: false, enabled: false });
  return NextResponse.json({ available: true, enabled: await priceAskEnabled(user.id) });
}

/** { enabled: boolean } */
export async function PATCH(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  if (!canAnswerPriceAsk(user)) {
    return NextResponse.json(
      { error: 'Это напоминание — для руководителей компаний-исполнителей' },
      { status: 403 },
    );
  }
  const body = await readJson(request);
  if (body === null) return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  const enabled = (body as { enabled?: unknown }).enabled;
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'Укажите, включить или выключить' }, { status: 400 });
  }
  await setPriceAsk(user.id, enabled);
  return NextResponse.json({ available: true, enabled });
}

export const PUT = PATCH;
