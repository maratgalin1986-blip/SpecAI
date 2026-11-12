import { describe, expect, it } from 'vitest';
import { onlineCount } from './activity';
import { HOUSE_COMPANY_ID } from './fleet';
import {
  HOUSE_LINE_ID_PREFIX,
  houseFreeNow,
  houseLineMachines,
  houseStandingRows,
  type HouseMachineRow,
} from './houseLine';
import { liveMachines, type PresenceRow } from './linePresence';
import { groupLive, liveGroupLabel } from './mapLabels';
import { lineMatchesOrder } from './notifications/routing';
import { offerCards } from './offerNow';

// Wednesday 11 November 2026, 23:30 Moscow: past every evening cutoff.
const NOW = new Date('2026-11-11T20:30:00Z');
const BASE = { baseLat: 55.7436, baseLon: 52.3959 };

const machine = (id: string, over: Partial<HouseMachineRow> = {}): HouseMachineRow => ({
  id,
  name: `Экскаватор ${id}`,
  companyId: HOUSE_COMPANY_ID,
  status: 'AVAILABLE',
  hourlyRate: 4000,
  dailyRate: 32000,
  categoryId: 'cat-excavators',
  category: { name: 'Экскаваторы', slug: 'excavators' },
  location: null,
  company: BASE,
  ...over,
});

const otherRow = (over: Partial<PresenceRow> = {}): PresenceRow => ({
  id: 'p-other',
  userId: 'u-other',
  lat: 55.79,
  lon: 49.12,
  online: false,
  note: null,
  updatedAt: new Date('2026-11-10T08:00:00Z'),
  standingUntil: new Date('2026-11-13T20:59:59Z'),
  standingForever: false,
  basePoint: { lat: 55.79, lon: 49.12 },
  user: { name: 'Марат Галин' },
  company: { id: 'c-other', name: 'Стройтех', verified: true },
  equipment: {
    id: 'm-other',
    name: 'Самосвал КамАЗ',
    status: 'AVAILABLE',
    hourlyRate: 2500,
    dailyRate: 20000,
    category: { name: 'Самосвалы', slug: 'dump-trucks' },
  },
  ...over,
});

const booking = (equipmentId: string, status = 'CONFIRMED') => ({
  equipmentId,
  status,
  startDate: new Date('2026-11-11T05:00:00Z'),
  endDate: new Date('2026-11-11T14:00:00Z'),
});

describe('houseStandingRows', () => {
  it('puts every free house machine on the line at the base, with no GPS ping and no driver', () => {
    const rows = houseStandingRows([machine('a'), machine('b')], [], NOW);
    expect(rows.map((row) => row.id)).toEqual([
      `${HOUSE_LINE_ID_PREFIX}a`,
      `${HOUSE_LINE_ID_PREFIX}b`,
    ]);
    const live = liveMachines(rows, null, 300, NOW);
    expect(live).toHaveLength(2);
    const first = live[0]!;
    expect(first.live).toBe(false);
    expect(first.until).toBeNull();
    expect(first.company.isHouse).toBe(true);
    expect(first.driver).toBe('СпецПласт16');
    expect(first.bubble).toBe('На линии · Экскаватор a · от 4 000 ₽/ч');
    expect({ lat: first.lat, lon: first.lon }).toEqual({ lat: 55.7436, lon: 52.3959 });
    // Nothing of an account leaves: the row has no user id to leak.
    expect(JSON.stringify(live)).not.toContain('userId');
  });

  it('leaves out retired, rented and repaired machines, other companies and machines without a point', () => {
    const rows = houseStandingRows(
      [
        machine('retired', { status: 'RETIRED' }),
        machine('rented', { status: 'RENTED' }),
        machine('repair', { status: 'IN_MAINTENANCE' }),
        machine('foreign', { companyId: 'c-other' }),
        machine('nowhere', { company: { baseLat: null, baseLon: null } }),
        machine('ok'),
      ],
      [],
      NOW,
    );
    expect(rows.map((row) => row.equipment?.id)).toEqual(['ok']);
  });

  it('shows a machine booked today as «Занята сегодня», after the free ones', () => {
    const rows = houseStandingRows([machine('busy'), machine('free')], [], NOW);
    const live = liveMachines(rows, null, 300, NOW, [booking('busy')]);
    expect(live.map((item) => [item.equipment?.id, item.busyToday])).toEqual([
      ['free', false],
      ['busy', true],
    ]);
    expect(live[1]!.bubble.startsWith('Занята сегодня')).toBe(true);
  });

  it('is idempotent and keeps a real row of the same machine', () => {
    const machines = [machine('a'), machine('b')];
    const once = houseStandingRows(machines, [], NOW);
    expect(houseStandingRows(machines, once, NOW)).toEqual([]);
    expect(houseStandingRows([...machines, ...machines], [], NOW)).toHaveLength(2);
    // The manager's phone reports machine «a» with fresh GPS: his row stays the only one.
    const phone = otherRow({
      id: 'p-house',
      online: true,
      updatedAt: new Date('2026-11-11T09:59:00Z'),
      onlineSince: new Date('2026-11-11T05:00:00Z'),
      standingUntil: null,
      company: { id: HOUSE_COMPANY_ID, name: 'ООО «СПЕЦПЛАСТ 16»', verified: true },
      equipment: { ...machine('a'), category: machine('a').category },
    });
    const noon = new Date('2026-11-11T10:00:00Z');
    expect(houseStandingRows(machines, [phone], noon).map((row) => row.equipment?.id)).toEqual([
      'b',
    ]);
    // A row that is not on the line any more (switched off, expired) does not hide the machine.
    const gone = { ...phone, online: false };
    expect(houseStandingRows(machines, [gone], noon)).toHaveLength(2);
  });

  it('does not touch other providers: they stand in the same list by the same rules', () => {
    const other = otherRow();
    const rows = [other, ...houseStandingRows([machine('a')], [other], NOW)];
    const live = liveMachines(rows, null, 300, NOW);
    expect(live.map((item) => item.equipment?.id).sort()).toEqual(['a', 'm-other']);
    const theirs = live.find((item) => item.equipment?.id === 'm-other')!;
    expect(theirs).toEqual(liveMachines([other], null, 300, NOW)[0]);
    // An expired provider is off the line as before; the house fleet is not.
    const expired = otherRow({ standingUntil: new Date('2026-11-10T20:59:59Z') });
    expect(
      liveMachines([expired, ...houseStandingRows([machine('a')], [expired], NOW)], null, 300, NOW),
    ).toHaveLength(1);
    // Both reach «Заказать технику»: СпецПласт16's list and «Сейчас на линии».
    const cards = offerCards(live, []);
    expect(cards.house.map((card) => card.id)).toEqual(['a']);
    expect(cards.house[0]!.live).toBe(true);
    expect(cards.line.map((card) => card.id)).toEqual(['m-other']);
  });
});

describe('houseLineMachines', () => {
  it('counts free house machines only, and marks the ones booked today', () => {
    const line = houseLineMachines(
      [
        machine('a'),
        machine('a'),
        machine('busy'),
        machine('cancelled'),
        machine('retired', { status: 'RETIRED' }),
        machine('foreign', { companyId: 'c-other' }),
      ],
      [booking('busy'), booking('cancelled', 'CANCELLED')],
      NOW,
    );
    expect(line.map((item) => [item.id, item.busyToday])).toEqual([
      ['a', false],
      ['busy', true],
      ['cancelled', false],
    ]);
    expect(houseFreeNow(line).map((item) => item.id)).toEqual(['a', 'cancelled']);
    expect(line[0]!.point).toEqual({ lat: 55.7436, lon: 52.3959 });
  });

  it('adds to the home counter once, next to the other providers', () => {
    const others = [
      {
        online: false,
        onlineSince: null,
        timeZone: null,
        updatedAt: new Date('2026-11-10T08:00:00Z'),
        standingUntil: new Date('2026-11-13T20:59:59Z'),
        lat: 55.79,
        lon: 49.12,
        companyId: 'c-other',
        equipment: { id: 'm-other', status: 'AVAILABLE', category: null },
      },
    ];
    expect(onlineCount(others, NOW)).toBe(1);
    expect(onlineCount(others, NOW, ['a', 'b'])).toBe(3);
    expect(onlineCount(others, NOW, ['a', 'm-other'])).toBe(2);
    expect(onlineCount([], NOW, [])).toBe(0);
  });

  it('matches an order near the base on any start date, as a standing line does', () => {
    const [line] = houseLineMachines([machine('a')], [], NOW);
    const at = {
      categoryId: line!.categoryId,
      lat: line!.point!.lat,
      lon: line!.point!.lon,
      live: false,
      standingForever: true,
      standingUntil: null,
    };
    const order = { categoryId: 'cat-excavators', lat: 55.7, lon: 52.3 };
    expect(
      lineMatchesOrder(at, { ...order, startDate: new Date('2026-12-20T06:00:00Z') }, NOW),
    ).toBe(true);
    expect(lineMatchesOrder(at, { ...order, categoryId: 'cat-cranes' }, NOW)).toBe(false);
    expect(lineMatchesOrder(at, { ...order, lat: 55.75, lon: 37.62 }, NOW)).toBe(false);
  });
});

describe('groupLive', () => {
  it('draws a fleet standing at one base as one pin and leaves live GPS and others alone', () => {
    const house = (id: string, busyToday = false) => ({
      id,
      lat: 55.7436,
      lon: 52.3959,
      live: false,
      busyToday,
      company: { isHouse: true },
    });
    const gps = { ...house('gps'), live: true };
    const other = { id: 'o', lat: 55.7436, lon: 52.3959, live: false, company: { isHouse: false } };
    const groups = groupLive([house('a'), gps, other, house('b', true)]);
    expect(groups.map((group) => group.map((item) => item.id))).toEqual([
      ['a', 'b'],
      ['gps'],
      ['o'],
    ]);
    expect(liveGroupLabel(groups[0]!)).toEqual({ title: '1 машина на линии', sub: 'СпецПласт16' });
    expect(liveGroupLabel([house('x', true), house('y', true)]).title).toBe(
      '2 машины · заняты сегодня',
    );
  });
});
