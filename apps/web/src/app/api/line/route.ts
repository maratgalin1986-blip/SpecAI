import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { linePresenceSchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { isOperator, isProvider } from '@/lib/fleet';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  isFresh,
  machineUnavailableReason,
  noteHasContacts,
  PRESENCE_MIN_INTERVAL_MS,
} from '@/lib/linePresence';
import {
  afterEveningCutoff,
  withinLineDay,
  LINE_DEFAULT_TIME_ZONE,
  lineSessionExpired,
  validTimeZone,
} from '@/lib/lineDay';
import { operatorOf } from '@/lib/shiftAccess';

export const dynamic = 'force-dynamic';

/**
 * «На линии»: PUT {online, lat, lon, equipmentId?, note?} from the app of a
 * provider's manager or machinist. One row per user (LinePresence): online
 * with the phone's position and an AVAILABLE machine of the company, or
 * offline. Customers see the fresh online rows on their home map
 * (api/line/nearby). GET returns the caller's own row.
 *
 * The evening cutoff (lib/lineDay.ts, 21:00 in the phone's `timeZone`): the
 * app switches itself off; should a phone left on keep reporting from its
 * background task (`source: 'background'`) after the session's cutoff, the
 * report is refused with `{ online: false, autoOff: true }` and the row goes
 * offline. The provider switching on again from the open app
 * (`source: 'foreground'`) starts a new session, visible until midnight.
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
  const now = new Date();
  const existing = await prisma.linePresence.findUnique({ where: { userId: user.id } });
  const reportedZone = validTimeZone(input.timeZone);
  const timeZone = reportedZone ?? validTimeZone(existing?.timeZone) ?? LINE_DEFAULT_TIME_ZONE;
  // The running session (online, with its start) is over by the evening cutoff.
  const sessionOver = Boolean(
    existing?.online &&
    existing.onlineSince &&
    lineSessionExpired(existing.onlineSince, now, timeZone),
  );
  if (input.online && input.source === 'background') {
    // A background report continues a live session; it never starts one
    // after the cutoff, nor keeps one the cutoff has ended.
    const continues = Boolean(existing?.online && existing.onlineSince);
    if (continues ? sessionOver : afterEveningCutoff(now, timeZone)) {
      const presence = existing?.online
        ? await prisma.linePresence.update({
            where: { userId: user.id },
            data: {
              online: false,
              note: null,
              ...(reportedZone ? { timeZone: reportedZone } : {}),
            },
          })
        : existing;
      return NextResponse.json({ presence, online: false, autoOff: true });
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

  const note = input.online ? (input.note ?? null) : null;
  // The provider switched on again from the open app after the cutoff: a new
  // session. An older app (no `source`) cannot tell a phone left on from a
  // provider at work, so its session ends at the cutoff and is renewed only
  // the next morning — never on the evening itself.
  const renewed =
    input.online &&
    sessionOver &&
    (input.source === 'foreground' || (input.source === undefined && withinLineDay(now, timeZone)));
  // A phone reports at most once per PRESENCE_MIN_INTERVAL_MS, but only a pure
  // position update is throttled: going online, changing the machine or the
  // note is always applied (so offline → online within 15 s works).
  const pureMove =
    !renewed &&
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

  // «Машина вышла на линию» (lib/activity.ts): the moment it went online,
  // kept while the same machine stays online; a phone back after its row went
  // stale (customers stopped seeing it) is a new start.
  const wentOnline =
    input.online &&
    (!existing ||
      !existing.online ||
      renewed ||
      existing.equipmentId !== equipmentId ||
      !isFresh(existing.updatedAt, now));
  const data = {
    companyId: user.companyId,
    online: input.online,
    equipmentId,
    note,
    ...(reportedZone ? { timeZone: reportedZone } : {}),
    ...(wentOnline ? { onlineSince: now } : {}),
    ...(input.online ? { lat: input.lat as number, lon: input.lon as number } : {}),
  };
  const presence = await prisma.linePresence.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, lat: input.lat ?? 0, lon: input.lon ?? 0, ...data },
  });
  return NextResponse.json({ presence });
}
