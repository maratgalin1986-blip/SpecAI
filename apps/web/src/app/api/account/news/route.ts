import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getRequestUser } from '@/lib/requestUser';
import { INVALID_JSON_MESSAGE, readJson } from '@/lib/apiInput';
import { newsAvailableFor, newsSubscribed, newsUpdate } from '@/lib/newsConsent';

export const dynamic = 'force-dynamic';

const NOT_AVAILABLE =
  'Рассылка — для заказчиков и исполнителей; машинист получает заявки от своей компании';

/** The weekly newsletter switch of the signed-in user (site — session, app — Bearer). */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  if (!newsAvailableFor(user.role)) {
    return NextResponse.json({ available: false, subscribed: false, emailVerified: false });
  }
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { newsConsentAt: true, newsUnsubscribedAt: true, emailVerified: true },
  });
  // Letters go only to a confirmed address (lib/newsletter.ts newsSubscribersWhere).
  return NextResponse.json({
    available: true,
    subscribed: newsSubscribed(row),
    emailVerified: Boolean(row?.emailVerified),
  });
}

/** { subscribed: boolean } — only an explicit true subscribes. */
export async function PATCH(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  if (!newsAvailableFor(user.role)) {
    return NextResponse.json({ error: NOT_AVAILABLE }, { status: 403 });
  }
  const body = await readJson(request);
  if (body === null) return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  const subscribed = (body as { subscribed?: unknown }).subscribed;
  if (typeof subscribed !== 'boolean') {
    return NextResponse.json({ error: 'Укажите, подписаться или отписаться' }, { status: 400 });
  }
  const row = await prisma.user.update({
    where: { id: user.id },
    data: newsUpdate(subscribed),
    select: { emailVerified: true },
  });
  return NextResponse.json({
    available: true,
    subscribed,
    emailVerified: Boolean(row.emailVerified),
  });
}
