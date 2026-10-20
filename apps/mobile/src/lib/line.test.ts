import { describe, expect, it } from 'vitest';
import { positionStatus, shortLabel, splitBubble, toLivePins } from './line';
import type { LiveMachine } from './api';

const machine: LiveMachine = {
  id: 'p1',
  lat: 55.74,
  lon: 52.4,
  driver: 'Марат Г.',
  company: { id: 'specplast16-house', name: 'СпецПласт16', verified: true, isHouse: true },
  equipment: {
    id: 'e1',
    name: 'JCB 3CX',
    category: 'Экскаваторы-погрузчики',
    categorySlug: 'backhoe-loaders',
    hourlyRate: 4000,
    dailyRate: 32000,
  },
  note: null,
  distanceKm: 1.2,
  bubble: 'Я на линии · JCB 3CX · от 4 000 ₽/ч · Марат Г.',
  updatedAt: '2026-10-15T09:00:00Z',
};

describe('live pins', () => {
  it('shortens the category for the pin and keeps the bubble and the house flag', () => {
    expect(shortLabel(machine)).toBe('Экска.');
    expect(
      shortLabel({ ...machine, equipment: { ...machine.equipment!, category: 'Краны' } }),
    ).toBe('Краны');
    expect(toLivePins([machine])[0]).toMatchObject({
      equipmentId: 'e1',
      house: true,
      head: 'Я на линии',
      body: 'JCB 3CX · от 4 000 ₽/ч · Марат Г.',
      note: null,
    });
    expect(toLivePins([{ ...machine, note: ' Могу выехать сразу ' }])[0]?.note).toBe(
      'Могу выехать сразу',
    );
  });

  it('splits the bubble into a small first line and the rest', () => {
    expect(splitBubble('Я на линии · JCB · от 4 000 ₽/ч')).toEqual({
      head: 'Я на линии',
      body: 'JCB · от 4 000 ₽/ч',
    });
    expect(splitBubble('Я на линии')).toEqual({ head: 'Я на линии', body: '' });
  });

  it('describes the reporter state', () => {
    const now = new Date('2026-10-15T09:05:00Z');
    expect(positionStatus('denied', null)).toMatch(/Нет доступа/);
    expect(positionStatus('granted', null)).toBe('Определяем положение…');
    expect(positionStatus('granted', new Date('2026-10-15T09:04:40Z'), now)).toBe(
      'Вы на карте у заказчиков',
    );
    expect(positionStatus('granted', new Date('2026-10-15T09:00:00Z'), now)).toBe(
      'На карте, обновлено 5 мин назад',
    );
  });
});
