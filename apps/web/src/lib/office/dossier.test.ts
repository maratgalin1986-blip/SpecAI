import { describe, expect, it } from 'vitest';
import { buildDossier, neighborsOf } from './dossier';
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
