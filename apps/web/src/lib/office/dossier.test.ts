import { describe, expect, it } from 'vitest';
import { buildDossier, neighborsOf, parseDossier, parseHours } from './dossier';
import type { Candidate, Neighbor } from './sources/types';

const candidate: Candidate = {
  name: 'Салон «Лада»',
  phone: '+78432000001',
  address: null,
  lat: 55.79,
  lon: 49.11,
  hours: null,
  website: null,
  email: null,
  whatsapp: null,
  telegram: null,
  tags: [],
  sourceRef: 'osm:node/1',
};

const at = (ref: string, hasSite: boolean, lat = 55.795): Neighbor => ({
  ref,
  lat,
  lon: 49.11,
  hasSite,
});

const dossier = (neighbors: readonly Neighbor[]) =>
  buildDossier({
    candidate,
    neighbors,
    niche: 'beauty',
    nicheTitle: 'Салон красоты',
    city: 'Казань',
  });

describe('buildDossier: соседи', () => {
  it('сама фирма, дубли по ссылке и дальние объекты не считаются', () => {
    const d = dossier([
      at('osm:node/1', false), // сама фирма
      at('osm:node/2', true),
      at('osm:node/2', true), // дубль
      at('osm:way/3', false),
      at('osm:node/4', true, 55.9), // дальше 2 км
    ]);
    expect(d.competitors).toEqual({ radiusKm: 2, sameNiche: 2, withSite: 1 });
  });

  it('пустой список — честный ноль; без координат фирмы сравнивать не с чем', () => {
    expect(dossier([]).competitors).toEqual({ radiusKm: 2, sameNiche: 0, withSite: 0 });
    const noGeo = buildDossier({
      candidate: { ...candidate, lat: null, lon: null },
      neighbors: [at('osm:node/2', true)],
      niche: 'beauty',
      nicheTitle: 'Салон красоты',
      city: null,
    });
    expect(noGeo.competitors).toBeNull();
  });

  it('neighborsOf: кандидаты с координатами становятся соседями', () => {
    expect(
      neighborsOf([
        { ...candidate, website: 'https://x.example' },
        { ...candidate, sourceRef: 'osm:node/9', lat: null },
      ]),
    ).toEqual([{ ref: 'osm:node/1', lat: 55.79, lon: 49.11, hasSite: true }]);
  });
});

describe('parseHours: выходные только когда они названы рабочими', () => {
  const cases: [string, boolean, boolean][] = [
    ['Mo-Fr 09:00-18:00; Sa,Su off', false, false],
    ['Пн–Пт 09:00–20:00; Сб, Вс — выходной', false, false],
    ['пн-пт 09:00-18:00, сб-вс выходной', false, false],
    ['Mo-Fr 09:00-18:00; Sa-Su closed', false, false],
    ['Mo-Fr 09:00-18:00; Sa 10:00-14:00', true, false],
    ['Mo-Fr 09:00-18:00, Sa 10:00-14:00, Su off', true, false],
    ['Mo-Fr 08:00-12:00,13:00-17:30; Sa 08:00-12:00', true, false],
    ['пн-сб 09:00-19:00; вс выходной', true, false],
    ['Mo-Su 09:00-18:00; Su off', true, false],
    ['Sa,Su 10:00-16:00', true, false],
    ['Fr-Mo 10:00-18:00', true, false],
    ['Mo-Su 09:00-21:00', true, true],
    ['пн-пт 09:00-18:00; сб 10:00-15:00; вс 10:00-15:00', true, true],
    ['ежедневно 10:00-22:00', true, true],
    ['без выходных 09:00-21:00', true, true],
    ['Пн-Вс круглосуточно', true, true],
    ['ежедневно, кроме воскресенья, 10:00-20:00', true, false],
    ['ежедневно 10:00-20:00 кроме вс', true, false],
    // Дни не названы — ничего не утверждаем.
    ['09:00-18:00', false, false],
    ['24/7', false, false],
    ['Mo,We,Fr 10:00-12:00', false, false],
    // «вс» во «все» и «sa» в «sale» — не дни недели.
    ['Все дни 09:00-18:00', false, false],
    ['Sale Mo-Fr 09:00-18:00', false, false],
  ];
  it.each(cases)('%s', (raw, weekends, everyDay) => {
    const hours = parseHours(raw);
    expect({ weekends: hours?.weekends, everyDay: hours?.everyDay }).toEqual({
      weekends,
      everyDay,
    });
  });
});

describe('parseDossier: часы читаются заново из факта карточки', () => {
  it('досье, записанное со старой ошибкой «выходные», исправляется при чтении', () => {
    const stored = JSON.stringify({
      v: 1,
      niche: 'beauty',
      nicheTitle: 'Салон красоты',
      city: 'Казань',
      facts: ['адрес: ул. Баумана, 1', 'часы: пн-пт 09:00-18:00; сб,вс off'],
      hours: { lateClose: null, weekends: true, roundTheClock: false },
      competitors: null,
      channels: { email: false, whatsapp: false, telegram: false },
      gaps: ['нет своего сайта'],
    });
    expect(parseDossier(stored)?.hours).toMatchObject({ weekends: false, everyDay: false });
  });

  it('новое досье: «Sa,Su off» не даёт выходных, «Mo-Su» — даёт все семь дней', () => {
    const build = (hours: string) =>
      buildDossier({
        candidate: { ...candidate, hours },
        neighbors: [],
        niche: 'beauty',
        nicheTitle: 'Салон красоты',
        city: 'Казань',
      });
    expect(build('Mo-Fr 09:00-18:00; Sa,Su off').hours?.weekends).toBe(false);
    const daily = parseDossier(JSON.stringify(build('Mo-Su 10:00-20:00')));
    expect(daily?.hours).toMatchObject({ weekends: true, everyDay: true });
  });
});
