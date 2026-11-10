import { describe, expect, it } from 'vitest';
import { storedOfferOf, type SentOffer } from './aiOffer';
import { isSampleSource, parseDossier, type Dossier } from './dossier';

const dossier: Dossier = {
  v: 1,
  niche: 'vet',
  nicheTitle: 'Ветклиника',
  city: 'Казань',
  facts: [],
  hours: null,
  competitors: { radiusKm: 2, sameNiche: 3, withSite: 1 },
  channels: { email: true, whatsapp: false, telegram: false },
  gaps: ['нет своего сайта'],
};
const offer = (angle: SentOffer['angle']): SentOffer => ({
  angle,
  subject: 'Тема',
  opener: 'Вступление',
  bullets: ['а', 'б', 'в'],
  packageKey: 'vizitka',
  packageReason: 'причина',
  ai: false,
});
const row = (over: Record<string, unknown>) => ({
  offerJson: JSON.stringify(offer('first_in_area')),
  source: 'nominatim+osm',
  emailSentAt: null,
  whatsappSentAt: null,
  ...over,
});

describe('неполный список источника: числа соседей не показываем', () => {
  it('какие источники отдают только часть фирм', () => {
    expect(isSampleSource('nominatim+osm')).toBe(true);
    expect(isSampleSource('nominatim')).toBe(true);
    expect(isSampleSource('2gis+nominatim')).toBe(true);
    expect(isSampleSource('osm')).toBe(false);
    expect(isSampleSource('manual')).toBe(false);
    expect(isSampleSource(null)).toBe(false);
  });

  it('досье такого источника читается без конкурентов; полного — как записано', () => {
    const raw = JSON.stringify(dossier);
    expect(parseDossier(raw, 'nominatim+osm')?.competitors).toBeNull();
    expect(parseDossier(raw, 'osm')?.competitors).toEqual(dossier.competitors);
    expect(parseDossier(raw)?.competitors).toEqual(dossier.competitors);
  });

  it('неотправленное предложение «про соседей» по неполному списку не годится — строится заново', () => {
    expect(storedOfferOf(row({}))).toBeNull();
    expect(
      storedOfferOf(row({ offerJson: JSON.stringify(offer('competitors_have_sites')) })),
    ).toBeNull();
    // Заход без чисел соседей остаётся.
    expect(storedOfferOf(row({ offerJson: JSON.stringify(offer('weekends')) }))?.angle).toBe(
      'weekends',
    );
    // Полный список (Overpass через раннер) — предложение как записано.
    expect(storedOfferOf(row({ source: 'osm' }))?.angle).toBe('first_in_area');
    // Уже отправленное не переписывается: это история.
    expect(storedOfferOf(row({ emailSentAt: new Date() }))?.angle).toBe('first_in_area');
    expect(storedOfferOf(row({ whatsappSentAt: new Date() }))?.angle).toBe('first_in_area');
    expect(storedOfferOf({ offerJson: null })).toBeNull();
  });

  it('неотправленное предложение, чей заход больше не следует из досье, строится заново', () => {
    const withHours = (hoursFact: string) =>
      JSON.stringify({
        ...dossier,
        competitors: null,
        facts: [hoursFact],
        // Так записал старый разбор: «выходные» по одному упоминанию «сб/вс».
        hours: { lateClose: null, weekends: true, roundTheClock: false },
      });
    const closed = withHours('часы: пн-пт 09:00-18:00; сб,вс off');
    const open = withHours('часы: пн-пт 09:00-18:00; сб 10:00-15:00');
    const stored = { offerJson: JSON.stringify(offer('weekends')), source: 'osm' };
    // «Sa,Su off» — не работа в выходные: письмо с таким заходом не годится.
    expect(storedOfferOf({ ...stored, dossierJson: closed })).toBeNull();
    expect(storedOfferOf({ ...stored, dossierJson: open })?.angle).toBe('weekends');
    // Отправленное — история, не переписывается.
    expect(storedOfferOf({ ...stored, dossierJson: closed, emailSentAt: new Date() })?.angle).toBe(
      'weekends',
    );
    // Досье нет вовсе — годятся только общие заходы.
    expect(storedOfferOf({ ...stored, dossierJson: null })).toBeNull();
    expect(
      storedOfferOf({ offerJson: JSON.stringify(offer('search')), dossierJson: null })?.angle,
    ).toBe('search');
    // Строка без поля досье (старые вызовы) — заход с досье не сверяется.
    expect(storedOfferOf(stored)?.angle).toBe('weekends');
  });
});
