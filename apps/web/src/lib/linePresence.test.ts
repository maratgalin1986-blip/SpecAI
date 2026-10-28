import { describe, expect, it } from 'vitest';
import { HOUSE_COMPANY_ID } from './fleet';
import {
  basePoint,
  baseMachines,
  isFresh,
  liveMachines,
  machineUnavailableReason,
  noteHasContacts,
  presenceBubble,
  publicNote,
  type BaseMachineRow,
  type PresenceRow,
} from './linePresence';
import { HIDDEN_CONTACT, HIDDEN_LINK } from './privacy';

const now = new Date('2026-10-15T09:00:00Z');
// «от 4 000 ₽/ч» with the locale's group separator and a no-break space.
const RATE = `от ${(4000).toLocaleString('ru-RU')}\u00a0₽/ч`;
const row = (over: Partial<PresenceRow> & { userId: string }): PresenceRow => ({
  id: `p-${over.userId}`,
  lat: 55.74,
  lon: 52.4,
  online: true,
  note: null,
  updatedAt: now,
  user: { name: 'Марат Галин' },
  company: { id: 'c1', name: 'ООО Ромашка', verified: false },
  equipment: {
    id: `e-${over.userId}`,
    name: 'Экскаватор JCB 3CX',
    status: 'AVAILABLE',
    hourlyRate: 4000,
    dailyRate: 32000,
    category: { name: 'Экскаваторы-погрузчики', slug: 'backhoe-loaders' },
  },
  ...over,
});

describe('presenceBubble', () => {
  it('reads «Я на линии · машина · цена · имя», the note travels separately', () => {
    expect(presenceBubble(row({ userId: 'u', note: 'Могу выехать сразу' }))).toBe(
      `Я на линии · Экскаватор JCB 3CX · ${RATE} · Марат Г.`,
    );
    expect(presenceBubble(row({ userId: 'u', equipment: null, user: { name: null } }))).toBe(
      'Я на линии',
    );
  });

  it('cuts a long machine name', () => {
    const name = 'Экскаватор-погрузчик JCB 4CX с гидромолотом и узким ковшом 2026';
    const bubble = presenceBubble(
      row({ userId: 'u', equipment: { ...row({ userId: 'u' }).equipment!, name } }),
    );
    expect(bubble).toContain('…');
    expect(bubble).not.toContain(name);
    expect(bubble.split(' · ')[1]?.length).toBeLessThanOrEqual(40);
  });
});

describe('note', () => {
  it('refuses a note with a phone, an e-mail or a link', () => {
    expect(noteHasContacts('Могу выехать сразу')).toBe(false);
    expect(noteHasContacts('Звоните +7 917 123-45-67')).toBe(true);
    expect(noteHasContacts('пишите на mail@example.com')).toBe(true);
    expect(noteHasContacts('сайт specplast16.ru')).toBe(true);
    expect(noteHasContacts(`уже ${HIDDEN_CONTACT}`)).toBe(true);
  });

  it('shows old rows without the masked tokens and on one line', () => {
    expect(
      publicNote(`Свободен, звоните ${HIDDEN_CONTACT}, ${HIDDEN_CONTACT} или ${HIDDEN_LINK}`),
    ).toBe('Свободен, звоните, или');
    expect(publicNote(`${HIDDEN_CONTACT}`)).toBeNull();
    expect(publicNote('  Могу\nвыехать   сразу ')).toBe('Могу выехать сразу');
    expect(publicNote(null)).toBeNull();
  });
});

describe('machineUnavailableReason', () => {
  it('lets only AVAILABLE machines go online', () => {
    expect(machineUnavailableReason('AVAILABLE')).toBeNull();
    expect(machineUnavailableReason('RENTED')).toMatch(/занята/);
    expect(machineUnavailableReason('IN_MAINTENANCE')).toMatch(/в ремонте/);
    expect(machineUnavailableReason('RETIRED')).toMatch(/снята с публикации/);
  });
});

describe('liveMachines', () => {
  it('keeps fresh online rows within the radius, nearest first, the house ahead', () => {
    const rows = [
      row({ userId: 'far', lat: 55.79, lon: 49.12 }), // Kazan, ~210 km
      row({ userId: 'stale', updatedAt: new Date(now.getTime() - 20 * 60_000) }),
      row({ userId: 'off', online: false }),
      row({ userId: 'other', lat: 55.75, lon: 52.41 }),
      row({
        userId: 'house',
        lat: 55.75,
        lon: 52.41,
        company: { id: 'specplast16-house', name: 'СпецПласт16', verified: true },
      }),
      row({ userId: 'here' }),
    ];
    const list = liveMachines(rows, { lat: 55.74, lon: 52.4 }, 60, now);
    expect(list.map((m) => m.id)).toEqual(['p-here', 'p-house', 'p-other']);
    expect(list[1]?.company.isHouse).toBe(true);
    expect(list[0]?.distanceKm).toBe(0);
    expect(liveMachines(rows, null, 60, now).map((m) => m.id)).toContain('p-far');
  });

  it('never gives out the driver account id', () => {
    const base = row({ userId: 'a' }).equipment!;
    const [machine] = liveMachines(
      [row({ userId: 'secret-user-id', id: 'p1', equipment: { ...base, id: 'e1' } })],
      null,
      60,
      now,
    );
    expect(machine?.id).toBe('p1');
    expect(JSON.stringify(machine)).not.toContain('secret-user-id');
  });

  it('hides machines that are rented, under repair or taken off publication', () => {
    const base = row({ userId: 'a' }).equipment!;
    const rows = [
      row({ userId: 'ok' }),
      row({ userId: 'rented', equipment: { ...base, id: 'e-rented', status: 'RENTED' } }),
      row({ userId: 'repair', equipment: { ...base, id: 'e-repair', status: 'IN_MAINTENANCE' } }),
      row({ userId: 'retired', equipment: { ...base, id: 'e-retired', status: 'RETIRED' } }),
    ];
    expect(liveMachines(rows, null, 60, now).map((m) => m.id)).toEqual(['p-ok']);
  });

  it('hides a driver whose machine is gone', () => {
    const rows = [row({ userId: 'ok' }), row({ userId: 'gone', equipment: null })];
    expect(liveMachines(rows, null, 60, now).map((m) => m.id)).toEqual(['p-ok']);
  });

  it('shows one machine once, at its freshest position', () => {
    const base = row({ userId: 'a' }).equipment!;
    const shared = { ...base, id: 'e-shared' };
    const rows = [
      row({
        userId: 'manager',
        equipment: shared,
        updatedAt: new Date(now.getTime() - 5 * 60_000),
        lat: 55.7,
      }),
      row({ userId: 'driver', equipment: shared, lat: 55.75, user: { name: 'Пётр Иванов' } }),
    ];
    const list = liveMachines(rows, null, 60, now);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'p-driver', lat: 55.75, driver: 'Пётр И.' });
  });

  it('cleans the note of masked contacts', () => {
    const [machine] = liveMachines(
      [row({ userId: 'n', note: `Свободен, звоните ${HIDDEN_CONTACT}` })],
      null,
      60,
      now,
    );
    expect(machine?.note).toBe('Свободен, звоните');
    expect(machine?.bubble).not.toContain(HIDDEN_CONTACT);
  });

  it('treats a 15-minute-old position as stale', () => {
    expect(isFresh(new Date(now.getTime() - 14 * 60_000), now)).toBe(true);
    expect(isFresh(new Date(now.getTime() - 16 * 60_000), now)).toBe(false);
  });
});

describe('baseMachines (СпецПласт16 at the base)', () => {
  const house = (over: Partial<BaseMachineRow> = {}): BaseMachineRow => ({
    id: 'sp16-1',
    name: 'Экскаватор JCB 3CX',
    companyId: HOUSE_COMPANY_ID,
    status: 'AVAILABLE',
    hourlyRate: 4000,
    dailyRate: 32000,
    category: { name: 'Экскаваторы-погрузчики', slug: 'backhoe-loaders' },
    location: { latitude: null, longitude: null },
    company: { baseLat: 55.7436, baseLon: 52.3959 },
    ...over,
  });

  it('labels the machine «на базе», never «Я на линии»', () => {
    const [pin] = baseMachines([house()], new Set(), null, 60);
    expect(pin?.bubble).toBe(`СпецПласт16 · Экскаватор JCB 3CX · ${RATE} · на базе`);
    expect(pin?.priceText).toBe(RATE);
    expect(pin?.bubble).not.toContain('Я на линии');
  });

  it('stands at the machine’s own point when it has one, else at the company base', () => {
    expect(basePoint(house())).toEqual({ lat: 55.7436, lon: 52.3959 });
    expect(basePoint(house({ location: { latitude: 55.75, longitude: 52.06 } }))).toEqual({
      lat: 55.75,
      lon: 52.06,
    });
    expect(basePoint(house({ company: { baseLat: null, baseLon: null } }))).toBeNull();
  });

  it('only the free house fleet, not machines on the line, within the radius', () => {
    const rows = [
      house(),
      house({ id: 'other', companyId: 'c1' }),
      house({ id: 'rented', status: 'RENTED' }),
      house({ id: 'live' }),
      house({ id: 'kazan', location: { latitude: 55.7963, longitude: 49.1088 } }),
      house({ id: 'nowhere', company: { baseLat: null, baseLon: null } }),
    ];
    const ids = (around: { lat: number; lon: number } | null, km: number) =>
      baseMachines(rows, new Set(['live']), around, km).map((pin) => pin.id);
    expect(ids({ lat: 55.74, lon: 52.4 }, 60)).toEqual(['sp16-1']);
    expect(ids({ lat: 55.74, lon: 52.4 }, 300)).toEqual(['sp16-1', 'kazan']);
    // Without a point: every one of them, the radius does not apply.
    expect(ids(null, 60)).toEqual(['sp16-1', 'kazan']);
  });

  it('keeps the nearest sixty, not the first sixty by name', () => {
    const far = Array.from({ length: 70 }, (_, index) =>
      house({
        id: `far-${index}`,
        name: `Авто ${index}`,
        location: { latitude: 55.9, longitude: 52.4 },
      }),
    );
    const near = house({
      id: 'near',
      name: 'Яма',
      location: { latitude: 55.741, longitude: 52.4 },
    });
    const pins = baseMachines([...far, near], new Set(), { lat: 55.74, lon: 52.4 }, 60);
    expect(pins).toHaveLength(60);
    expect(pins[0]?.id).toBe('near');
  });
});

describe('liveMachines — «на линии на 5 рабочих дней» without GPS', () => {
  const until = new Date('2026-10-16T20:59:59.999Z'); // Friday 23:59 Moscow
  const stale = new Date(now.getTime() - 3 * 60 * 60_000);
  const standing = (over: Partial<PresenceRow> & { userId: string }) =>
    row({ online: false, updatedAt: stale, gpsAt: stale, standingUntil: until, ...over });

  it('shows a standing machine at its base, «Я на линии до пт», while the period runs', () => {
    const [machine] = liveMachines(
      [standing({ userId: 'u', basePoint: { lat: 55.7, lon: 52.3 } })],
      { lat: 55.74, lon: 52.4 },
      60,
      now,
    );
    expect(machine).toMatchObject({
      lat: 55.7,
      lon: 52.3,
      live: false,
      until: 'до пт',
      busyToday: false,
    });
    expect(machine!.bubble).toBe(`Я на линии до пт · Экскаватор JCB 3CX · ${RATE} · Марат Г.`);
  });

  it('hides it once the period ran out, and with «пока не отключу» never', () => {
    const later = new Date('2026-10-17T09:00:00Z');
    expect(liveMachines([standing({ userId: 'u' })], null, 60, later)).toHaveLength(0);
    const forever = liveMachines(
      [standing({ userId: 'u', standingUntil: null, standingForever: true })],
      null,
      60,
      later,
    );
    expect(forever[0]?.until).toBe('до отключения');
  });

  it('a fresh GPS report puts the pin where the phone is: «рядом сейчас»', () => {
    const [machine] = liveMachines(
      [
        standing({
          userId: 'u',
          online: true,
          gpsAt: now,
          updatedAt: now,
          lat: 55.75,
          lon: 52.41,
          basePoint: { lat: 55.7, lon: 52.3 },
        }),
      ],
      null,
      60,
      now,
    );
    expect(machine).toMatchObject({ lat: 55.75, lon: 52.41, live: true });
    expect(machine!.bubble.startsWith('Я на линии, рядом сейчас · ')).toBe(true);
  });

  it('applies the radius to the base point, not to the stale position', () => {
    const far = standing({
      userId: 'u',
      lat: 55.74,
      lon: 52.4,
      basePoint: { lat: 59.9, lon: 30.3 },
    });
    expect(liveMachines([far], { lat: 55.74, lon: 52.4 }, 60, now)).toHaveLength(0);
  });

  it('marks a machine booked today as busy and puts the free ones first', () => {
    const rows = [
      standing({ userId: 'busy', lat: 55.74, lon: 52.4 }),
      standing({ userId: 'free', lat: 55.9, lon: 52.6 }),
    ];
    const bookings = [
      {
        equipmentId: 'e-busy',
        startDate: new Date('2026-10-15T05:00:00Z'),
        endDate: new Date('2026-10-16T15:00:00Z'),
        status: 'CONFIRMED',
      },
      {
        equipmentId: 'e-free',
        startDate: new Date('2026-10-20T05:00:00Z'),
        endDate: new Date('2026-10-20T15:00:00Z'),
        status: 'PENDING',
      },
    ];
    const machines = liveMachines(rows, { lat: 55.74, lon: 52.4 }, 60, now, bookings);
    expect(machines.map((item) => item.equipment?.id)).toEqual(['e-free', 'e-busy']);
    expect(machines[1]).toMatchObject({ busyToday: true, busyDays: ['2026-10-15', '2026-10-16'] });
    expect(machines[1]!.bubble.startsWith('Занята сегодня · ')).toBe(true);
    expect(machines[0]!.busyDays).toEqual([]);
  });

  it('still leaves out a machine that is not «Свободна»', () => {
    const rented = standing({ userId: 'u' });
    rented.equipment = { ...rented.equipment!, status: 'RENTED' };
    expect(liveMachines([rented], null, 60, now)).toHaveLength(0);
  });

  it('never puts the driver’s account id into the answer', () => {
    const json = JSON.stringify(
      liveMachines([standing({ userId: 'secret-user-id', id: 'p1' })], null, 60, now),
    );
    expect(json).not.toContain('"secret-user-id"');
    expect(json).not.toContain('userId');
  });
});
