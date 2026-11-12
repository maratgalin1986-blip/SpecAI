import { describe, expect, it } from 'vitest';
import { cityUtcOffset, inLocalHours, localHour } from './localTime';

describe('местное время фирмы', () => {
  it('пояс — по региону города; неизвестный или пустой город — Москва', () => {
    expect(cityUtcOffset('Владивосток')).toBe(10);
    expect(cityUtcOffset('Хабаровск')).toBe(10);
    expect(cityUtcOffset('Южно-Сахалинск')).toBe(11);
    expect(cityUtcOffset('Петропавловск-Камчатский')).toBe(12);
    expect(cityUtcOffset('Якутск')).toBe(9);
    expect(cityUtcOffset('Екатеринбург')).toBe(5);
    expect(cityUtcOffset('Самара')).toBe(4);
    expect(cityUtcOffset('Казань')).toBe(3);
    expect(cityUtcOffset('Калининград')).toBe(2);
    expect(cityUtcOffset('Неизвестный посёлок')).toBe(3);
    expect(cityUtcOffset(null)).toBe(3);
  });

  it('01:00 по Москве — 08:00 во Владивостоке: ему пора, Казани рано', () => {
    const now = new Date('2026-11-13T01:00:00+03:00');
    const hours = { from: 8, to: 20 };
    expect(localHour(now, 'Владивосток')).toBe(8);
    expect(inLocalHours(now, 'Владивосток', hours)).toBe(true);
    expect(inLocalHours(now, 'Казань', hours)).toBe(false);
    expect(inLocalHours(new Date('2026-11-13T13:00:00+03:00'), 'Владивосток', hours)).toBe(false);
  });
});
