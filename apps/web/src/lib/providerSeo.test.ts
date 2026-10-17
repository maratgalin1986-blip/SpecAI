import { describe, expect, it } from 'vitest';
import { providerJsonLd, providerMetaDescription, type ProviderSeoInput } from './providerSeo';

const input = (over: Partial<ProviderSeoInput> = {}): ProviderSeoInput => ({
  id: 'c1',
  name: 'Парк Урал',
  baseAddress: null,
  rating: null,
  ratingCount: 0,
  machines: [],
  city: 'Екатеринбург',
  region: 'Свердловская область',
  ...over,
});

describe('providerJsonLd', () => {
  it("describes the provider's own city and region, not the platform's", () => {
    const ld = providerJsonLd(input(), 'https://example.test');
    expect(ld.areaServed).toBe('Свердловская область');
    expect(ld.address).toMatchObject({
      addressLocality: 'Екатеринбург',
      addressRegion: 'Свердловская область',
      addressCountry: 'RU',
    });
  });

  it('leaves out an unknown city instead of naming a default one', () => {
    const ld = providerJsonLd(input({ city: null, region: null }), 'https://example.test');
    expect(ld.areaServed).toBe('Россия');
    expect(ld.address).toEqual({ '@type': 'PostalAddress', addressCountry: 'RU' });
    expect(JSON.stringify(ld)).not.toMatch(/Татарстан|Челны/);
  });
});

describe('providerMetaDescription', () => {
  it('names the base, else the city, else neither', () => {
    expect(providerMetaDescription(input({ baseAddress: 'Екатеринбург, база' }))).toContain(
      'база: Екатеринбург, база',
    );
    expect(providerMetaDescription(input())).toContain('Екатеринбург');
    expect(providerMetaDescription(input({ city: null }))).not.toContain('null');
  });
});
