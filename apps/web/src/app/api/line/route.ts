import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { linePresenceSchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { isOperator, isProvider } from '@/lib/fleet';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  machineUnavailableReason,
  noteHasContacts,
  PRESENCE_MIN_INTERVAL_MS,
} from '@/lib/linePresence';
import { operatorOf } from '@/lib/shiftAccess';

export const dynamic = 'force-dynamic';

/**
 * «На линии»: PUT {online, lat, lon, equipmentId?, note?} from the app of a
 * provider's manager or machinist. One row per user (LinePresence): online
 * with the phone's position and an AVAILABLE machine of the company, or
 * offline. Customers see the fresh online rows on their home map
 * (api/line/nearby). GET returns the caller's own row.
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
  // A machinist switched off by the company admin is not on the line.
  if (isOperator(user)) {
    const operator = await operatorOf(user);
    if (!operator || !operator.active) {
      return NextResponse.json({ error: 'Доступ машиниста отключён' }, { status: 403 });
    }
  }
  if (input.online && !input.equipmentId) {
    return NextResponse.json(
      { error: 'Выберите машину, с которой выходите на линию' },
      { status: 400 },
    );
  }
  // The bubble is public: a phone or a link in the note is refused outright.
  if (input.note && noteHasContacts(input.note)) {
    return NextResponse.json({ error: 'В заметке нельзя указывать контакты' }, { status: 400 });
  }
  let equipmentId: string | null = null;
  if (input.online && input.equipmentId) {
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
    const reason = machineUnavailableReason(machine.status);
    if (reason) return NextResponse.json({ error: reason }, { status: 409 });
    equipmentId = input.equipmentId;
  }

  const existing = await prisma.linePresence.findUnique({ where: { userId: user.id } });
  const note = input.online ? (input.note ?? null) : null;
  // A phone reports at most once per PRESENCE_MIN_INTERVAL_MS, but only a pure
  // position update is throttled: going online, changing the machine or the
  // note is always applied (so offline → online within 15 s works).
  const pureMove =
    existing !== null &&
    existing.online &&
    input.online &&
    existing.equipmentId === equipmentId &&
    (existing.note ?? null) === note;
  const limited =
    input.online &&
    !checkRateLimit(`line:${user.id}`, { limit: 1, windowMs: PRESENCE_MIN_INTERVAL_MS }).ok;
  if (limited && pureMove) {
    return NextResponse.json({ presence: existing, throttled: true });
  }

  const data = {
    companyId: user.companyId,
    online: input.online,
    equipmentId,
    note,
    ...(input.online ? { lat: input.lat as number, lon: input.lon as number } : {}),
  };
  const presence = await prisma.linePresence.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, lat: input.lat ?? 0, lon: input.lon ?? 0, ...data },
  });
  return NextResponse.json({ presence });
}
