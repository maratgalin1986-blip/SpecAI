import { describe, expect, it } from 'vitest';
import { equipmentJsonLd, type EquipmentSeoInput } from './equipmentSeo';

const machine: EquipmentSeoInput = {
  id: 'eq1',
  name: 'JCB 4CX',
  category: 'Экскаваторы-погрузчики',
  description: null,
  seller: 'СпецПласт16',
  hour: 2500,
  shift: 20000,
  currency: 'RUB',
  status: 'AVAILABLE',
  photos: ['/images/machines/backhoe-1.jpg', 'https://cdn.example/1.jpg'],
  rating: 4.75,
  reviews: 4,
};

describe('equipmentJsonLd', () => {
  it('is a Product whose Offer carries the hourly price of the page', () => {
    const ld = equipmentJsonLd(machine, 'https://site.example/')!;
    expect(ld['@type']).toBe('Product');
    expect(ld.url).toBe('https://site.example/equipment/eq1');
    const offer = ld.offers as Record<string, unknown>;
    expect(offer.price).toBe(2500);
    expect(offer.priceCurrency).toBe('RUB');
    expect((offer.priceSpecification as Record<string, unknown>).unitText).toBe('час');
    expect(offer.availability).toBe('https://schema.org/InStock');
    expect(ld.image).toEqual([
      'https://site.example/images/machines/backhoe-1.jpg',
      'https://cdn.example/1.jpg',
    ]);
    expect((ld.aggregateRating as Record<string, unknown>).ratingValue).toBe(4.8);
  });

  it('falls back to the shift price and leaves the rating out without reviews', () => {
    const ld = equipmentJsonLd(
      { ...machine, hour: null, rating: null, reviews: 0, status: 'RENTED', photos: [] },
      'https://site.example',
    )!;
    const offer = ld.offers as Record<string, unknown>;
    expect(offer.price).toBe(20000);
    expect((offer.priceSpecification as Record<string, unknown>).unitText).toBe('смена');
    expect(offer.availability).toBe('https://schema.org/LimitedAvailability');
    expect(ld.aggregateRating).toBeUndefined();
    expect(ld.image).toBeUndefined();
  });

  it('gives nothing for a machine without a price', () => {
    expect(
      equipmentJsonLd({ ...machine, hour: null, shift: 0 }, 'https://site.example'),
    ).toBeNull();
  });

  it('carries no ids of people and no contacts', () => {
    const text = JSON.stringify(equipmentJsonLd(machine, 'https://site.example'));
    expect(text).not.toMatch(/telephone|email|userId|companyId/);
  });
});
