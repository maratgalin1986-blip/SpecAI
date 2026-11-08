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
import { standingActive, standingData } from '@/lib/lineStanding';
import { basePoint } from '@/lib/linePresence';
import { tickDeferredOrderNotices } from '@/lib/deferredOrderNotices';

export const dynamic = 'force-dynamic';
// Sends due «Пригласи друга» alerts: never from Next's Data Cache.
export const fetchCache = 'force-no-store';

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
 *
 * «На линии на 5 рабочих дней» (owner, 2026-10-28, lib/lineStanding.ts):
 * going online also starts a standing availability — 5 working days unless
 * `standing` says otherwise ('until' + `until`, 'forever'); heartbeats keep
 * the running one. Customers see the machine for the whole period, with or
 * without fresh GPS (`online` is now only the live GPS session). The
 * evening cutoff ends the GPS session, not the period. Going offline with
 * `standing: 'off'` ends both; an older app's plain `online: false` during
 * the working day is the provider's own «Уйти с линии» and ends both too,
 * while the one it sends by itself at 21:00 (outside the working day) ends
 * only GPS. From the cabinet (`source: 'web'`, no position) the machine
 * stands at its own point or the company's base.
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
  // Phones on the line report every minute: the most frequent tick for the
  // «Пригласи друга» delayed alerts (lib/deferredOrderNotices.ts).
  await tickDeferredOrderNotices('line');
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
      // Only the GPS session ends: a standing line keeps the machine on the map.
      const presence = existing?.online
        ? await prisma.linePresence.update({
            where: { userId: user.id },
            data: {
              online: false,
              ...(existing && standingActive(existing, now) ? {} : { note: null }),
              ...(reportedZone ? { timeZone: reportedZone } : {}),
            },
          })
        : existing;
      return NextResponse.json({
        presence,
        online: false,
        autoOff: true,
        standing: presence ? standingActive(presence, now) : false,
      });
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
  let machinePoint: { lat: number; lon: number } | null = null;
  if (input.online && input.equipmentId) {
    const machine = await prisma.equipment.findUnique({
      where: { id: input.equipmentId },
      select: {
        companyId: true,
        status: true,
        location: { select: { latitude: true, longitude: true } },
        company: { select: { baseLat: true, baseLon: true } },
      },
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
    machinePoint = basePoint(machine);
  }

  // The phone's position, or none (the cabinet): the GPS session is the phone's only.
  const gps = input.online && input.lat !== undefined && input.lon !== undefined;
  const fromPhone = gps && input.source !== 'web';
  const standingRunning = Boolean(existing && standingActive(existing, now));
  // Which standing period to write (null: leave the columns as they are).
  let standingMode = input.standing ?? null;
  if (!standingMode && input.online && !standingRunning) standingMode = 'days5';
  // An older app's «Уйти с линии» (no `standing`) in the working day ends
  // the period; the one it sends itself at the evening cutoff does not.
  if (!standingMode && !input.online && standingRunning && withinLineDay(now, timeZone)) {
    standingMode = 'off';
  }
  const standing = standingMode ? standingData(standingMode, now, timeZone, input.until) : null;
  if (standingMode && !standing) {
    return NextResponse.json(
      { error: 'Выберите дату не раньше сегодняшней и не дальше чем через 60 дней' },
      { status: 400 },
    );
  }
  const point = gps
    ? { lat: input.lat as number, lon: input.lon as number }
    : input.online
      ? (machinePoint ?? (existing ? { lat: existing.lat, lon: existing.lon } : null))
      : null;
  if (input.online && !point) {
    return NextResponse.json(
      {
        error:
          'Укажите адрес базы компании или место машины — по нему заказчики увидят её на карте',
      },
      { status: 400 },
    );
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
    !standingMode &&
    fromPhone &&
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
    fromPhone &&
    (!existing ||
      !existing.online ||
      renewed ||
      existing.equipmentId !== equipmentId ||
      !isFresh(existing.updatedAt, now));
  // The cabinet changes the period only: a running GPS session of the phone
  // stays as it is, and the note the phone set is kept.
  const fromCabinet = input.online && !fromPhone;
  // After this write the standing period still runs: the machine and the
  // note stay even when the phone's GPS session ends.
  const keepsStanding = standing
    ? Boolean(standing.standingForever || standing.standingUntil)
    : standingRunning;
  const data = {
    companyId: user.companyId,
    online: fromCabinet ? (existing?.online ?? false) : input.online,
    equipmentId: input.online
      ? equipmentId
      : keepsStanding
        ? (existing?.equipmentId ?? null)
        : null,
    note: input.online
      ? fromCabinet
        ? (input.note ?? existing?.note ?? null)
        : note
      : keepsStanding
        ? (existing?.note ?? null)
        : null,
    ...(reportedZone ? { timeZone: reportedZone } : {}),
    ...(wentOnline ? { onlineSince: now } : {}),
    ...(fromPhone ? { gpsAt: now } : {}),
    ...(point && (fromPhone || !existing?.online) ? { lat: point.lat, lon: point.lon } : {}),
    ...(standing ?? {}),
  };
  const presence = await prisma.linePresence.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, lat: point?.lat ?? 0, lon: point?.lon ?? 0, ...data },
  });
  return NextResponse.json({ presence, standing: standingActive(presence, now) });
}
