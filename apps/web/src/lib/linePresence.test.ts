import { describe, expect, it } from 'vitest';
import {
  isFresh,
  liveMachines,
  machineUnavailableReason,
  noteHasContacts,
  presenceBubble,
  publicNote,
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
