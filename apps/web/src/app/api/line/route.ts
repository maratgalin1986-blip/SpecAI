import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { linePresenceSchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { isOperator, isProvider } from '@/lib/fleet';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { checkRateLimit } from '@/lib/rateLimit';
import { maskContactsAndLinks } from '@/lib/privacy';
import { PRESENCE_MIN_INTERVAL_MS } from '@/lib/linePresence';

export const dynamic = 'force-dynamic';

/**
 * «На линии»: PUT {online, lat, lon, equipmentId?, note?} from the app of a
 * provider's manager or machinist. One row per user (LinePresence): online
 * with the phone's position, or offline. Customers see the fresh online rows
 * on their home map (api/line/nearby). GET returns the caller's own row.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!isProvider(user) && !isOperator(user)) {
    return NextResponse.json({ error: 'Только для исполнителей' }, { status: 403 });
  }
  const presence = await prisma.linePresence.findUnique({ where: { userId: user.id } });
  return NextResponse.json({ presence });
}

export async function PUT(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!isProvider(user) && !isOperator(user)) {
    return NextResponse.json({ error: 'Только для исполнителей' }, { status: 403 });
  }
  const body = await readJson(request);
  if (body === null) return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  const parsed = linePresenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const input = parsed.data;
  let equipmentId: string | null = null;
  if (input.equipmentId) {
    const machine = await prisma.equipment.findUnique({
      where: { id: input.equipmentId },
      select: { companyId: true, status: true },
    });
    if (!machine || machine.companyId !== user.companyId) {
      return NextResponse.json(
        { error: 'Можно выйти на линию только со своей машиной' },
        { status: 403 },
      );
    }
    if (machine.status === 'RETIRED') {
      return NextResponse.json({ error: 'Эта машина снята с линии' }, { status: 409 });
    }
    equipmentId = input.equipmentId;
  }

  // A phone reports at most once per PRESENCE_MIN_INTERVAL_MS; a wrong
  // machine above is refused before the throttle counts.
  if (
    input.online &&
    !checkRateLimit(`line:${user.id}`, { limit: 1, windowMs: PRESENCE_MIN_INTERVAL_MS }).ok
  ) {
    const presence = await prisma.linePresence.findUnique({ where: { userId: user.id } });
    return NextResponse.json({ presence, throttled: true });
  }

  const data = {
    companyId: user.companyId,
    online: input.online,
    equipmentId,
    // The bubble is public: no phones or links in it.
    note: input.note ? maskContactsAndLinks(input.note) : null,
    ...(input.online ? { lat: input.lat as number, lon: input.lon as number } : {}),
  };
  const presence = await prisma.linePresence.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, lat: input.lat ?? 0, lon: input.lon ?? 0, ...data },
  });
  return NextResponse.json({ presence });
}
