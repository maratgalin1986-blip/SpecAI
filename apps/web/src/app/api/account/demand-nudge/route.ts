import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/requestUser';
import { INVALID_JSON_MESSAGE, readJson } from '@/lib/apiInput';
import { canAnswerPriceAsk } from '@/lib/aktualno';
import { demandNudgeEnabled, setDemandNudge } from '@/lib/demandNudgeData';

export const dynamic = 'force-dynamic';

/**
 * The daily «Сегодня N заявок рядом — выйдите на линию» switch of the
 * signed-in user (site — session, app — Bearer). The message goes to the same
 * people as «Актуализация»: provider managers of companies other than the
 * house fleet (canAnswerPriceAsk); for everyone else `available: false` and
 * the switch is not shown.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  if (!canAnswerPriceAsk(user)) return NextResponse.json({ available: false, enabled: false });
  return NextResponse.json({ available: true, enabled: await demandNudgeEnabled(user.id) });
}

/** { enabled: boolean } */
export async function PATCH(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  if (!canAnswerPriceAsk(user)) {
    return NextResponse.json(
      { error: 'Это сообщение — для руководителей компаний-исполнителей' },
      { status: 403 },
    );
  }
  const body = await readJson(request);
  if (body === null) return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  const enabled = (body as { enabled?: unknown }).enabled;
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'Укажите, включить или выключить' }, { status: 400 });
  }
  await setDemandNudge(user.id, enabled);
  return NextResponse.json({ available: true, enabled });
}

export const PUT = PATCH;
