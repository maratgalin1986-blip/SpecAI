import { describe, expect, it } from 'vitest';
import { withFallback } from './fallback';
import type { Candidate, ProspectSource, SearchResult, SourceNiche } from './types';

const withSite: Candidate = {
  name: 'ТрансЛогистик',
  phone: '+78432000001',
  address: null,
  lat: null,
  lon: null,
  hours: null,
  website: 'https://tl.example',
  email: null,
  whatsapp: null,
  telegram: null,
  tags: [],
  sourceRef: 'osm:node/1',
};

function source(id: string, result: SearchResult, calls: string[]): ProspectSource {
  return {
    id,
    async search() {
      calls.push(id);
      return result;
    },
  };
}

const search = (niche: SourceNiche, calls: string[]) =>
  withFallback([
    source('first', { status: 'ok', candidates: [withSite] }, calls),
    source('second', { status: 'ok', candidates: [] }, calls),
  ]).search({ niche, city: { name: 'Омск', lat: 54.99, lon: 73.37 }, radiusKm: 15, limit: 10 });

describe('withFallback: фирмы с сайтом', () => {
  it('«Сайты»: ответ из одних фирм с сайтом — не кандидаты, спрашивается следующий источник', async () => {
    const calls: string[] = [];
    const result = await search({ key: 'car_repair', osm: [['shop', 'car_repair']] }, calls);
    expect(calls).toEqual(['first', 'second']);
    expect(result).toEqual({ status: 'ok', candidates: [] });
  });

  it('проект площадки (websiteOk): фирма с сайтом — кандидат, первый ответ побеждает', async () => {
    const calls: string[] = [];
    const result = await search(
      { key: 'freight', osm: [['office', 'logistics']], websiteOk: true },
      calls,
    );
    expect(calls).toEqual(['first']);
    expect(result).toEqual({ status: 'ok', candidates: [withSite] });
  });
});
