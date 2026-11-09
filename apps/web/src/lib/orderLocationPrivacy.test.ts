import { describe, expect, it } from 'vitest';
import { companyBase, locationForViewer, type RoughOrderLocation } from './orderLocationPrivacy';

/** The provider's view, typed: the tests read `distanceKm` from it. */
const rough = (...args: Parameters<typeof locationForViewer>) =>
  locationForViewer(...args) as RoughOrderLocation | null;

// A site in Kazan and a base ~25 km away.
const site = {
  addressLine: 'Казань, ул. Баумана, 1',
  city: 'Казань',
  latitude: 55.7887,
  longitude: 49.1221,
};
const base = { lat: 55.9, lon: 48.8 };

describe('locationForViewer', () => {
  it('gives the owner, the admin and the booked company the full location', () => {
    expect(locationForViewer(site, { full: true, base })).toBe(site);
    expect(locationForViewer(site, { full: true, base: null })).toBe(site);
  });

  it('hides the address and the coordinates from other providers', () => {
    const view = rough(site, { full: false, base });
    expect(view).toEqual({
      addressLine: null,
      city: 'Казань',
      latitude: null,
      longitude: null,
      distanceKm: expect.any(Number),
    });
    expect(view?.distanceKm).toBeGreaterThan(20);
    expect(view?.distanceKm).toBeLessThan(30);
    expect(Number.isInteger(view?.distanceKm)).toBe(true);
    expect(JSON.stringify(view)).not.toContain('Баумана');
    expect(JSON.stringify(view)).not.toContain('55.78');
  });

  it('measures from the city centre when the order has no coordinates', () => {
    const view = rough({ ...site, latitude: null, longitude: null }, { full: false, base });
    expect(view?.city).toBe('Казань');
    expect(view?.distanceKm).toBeGreaterThan(0);
  });

  it('has no distance without a base or a place, and no location without one', () => {
    expect(rough(site, { full: false, base: null })?.distanceKm).toBeNull();
    expect(
      locationForViewer(
        { addressLine: 'где-то', city: '', latitude: null, longitude: null },
        { full: false, base },
      ),
    ).toMatchObject({ city: '', distanceKm: null, addressLine: null });
    expect(locationForViewer(null, { full: false, base })).toBeNull();
  });
});

describe('companyBase', () => {
  it('needs both coordinates', () => {
    expect(companyBase({ baseLat: 55.9, baseLon: 48.8 })).toEqual(base);
    expect(companyBase({ baseLat: 55.9, baseLon: null })).toBeNull();
    expect(companyBase(null)).toBeNull();
  });
});
