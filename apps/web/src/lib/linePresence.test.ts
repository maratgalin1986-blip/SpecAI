import { describe, expect, it } from 'vitest';
import { isFresh, liveMachines, presenceBubble, type PresenceRow } from './linePresence';

const now = new Date('2026-10-15T09:00:00Z');
const row = (over: Partial<PresenceRow> & { userId: string }): PresenceRow => ({
  lat: 55.74,
  lon: 52.4,
  online: true,
  note: null,
  updatedAt: now,
  user: { name: 'Марат Галин' },
  company: { id: 'c1', name: 'ООО Ромашка', verified: false },
  equipment: {
    id: 'e1',
    name: 'Экскаватор JCB 3CX',
    hourlyRate: 4000,
    dailyRate: 32000,
    category: { name: 'Экскаваторы-погрузчики', slug: 'backhoe-loaders' },
  },
  ...over,
});

describe('presenceBubble', () => {
  it('reads «Я на линии · машина · цена · имя · заметка»', () => {
    expect(presenceBubble(row({ userId: 'u', note: 'Могу выехать сразу' }))).toBe(
      'Я на линии · Экскаватор JCB 3CX · от 4 000 ₽/ч · Марат Г. · Могу выехать сразу',
    );
    expect(presenceBubble(row({ userId: 'u', equipment: null, user: { name: null } }))).toBe(
      'Я на линии',
    );
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
    expect(list.map((m) => m.id)).toEqual(['here', 'house', 'other']);
    expect(list[1]?.company.isHouse).toBe(true);
    expect(list[0]?.distanceKm).toBe(0);
    expect(liveMachines(rows, null, 60, now).map((m) => m.id)).toContain('far');
  });

  it('treats a 15-minute-old position as stale', () => {
    expect(isFresh(new Date(now.getTime() - 14 * 60_000), now)).toBe(true);
    expect(isFresh(new Date(now.getTime() - 16 * 60_000), now)).toBe(false);
  });
});
