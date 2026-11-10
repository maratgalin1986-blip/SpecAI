import { describe, expect, it } from 'vitest';
import { buildDossier, neighborsOf, parseDossier, parseHours } from './dossier';
import { applicableAngles, buildOffer, OFFER_ANGLES } from './offer';
import { chooseAngle, angleScore, learningTable, MIN_TRIALS, type AngleStat } from './learning';
import type { Candidate } from './sources/types';
import type { OfferAngle } from './offer';

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  name: 'Стоматология «Улыбка»',
  phone: '+78432000001',
  address: 'ул. Баумана, 10, Казань',
  lat: 55.79,
  lon: 49.11,
  hours: 'Mo-Fr 09:00-21:00; Sa 10:00-16:00',
  website: null,
  email: 'info@ulybka.example',
  whatsapp: '+79170000001',
  telegram: null,
  tags: [],
  sourceRef: 'osm:node/1',
  ...over,
});

const near = (i: number, site: boolean, dLat = 0.005): Candidate =>
  cand({
    name: `Сосед ${i}`,
    phone: `+7843200010${i}`,
    sourceRef: `osm:node/1${i}`,
    lat: 55.79 + dLat,
    website: site ? 'https://x.example' : null,
  });

describe('parseHours', () => {
  it('позднее закрытие, выходные, круглосуточно — OSM и 2ГИС', () => {
    expect(parseHours('Mo-Fr 09:00-21:00; Sa 10:00-16:00')).toEqual({
      lateClose: '21:00',
      weekends: true,
      everyDay: false,
      roundTheClock: false,
    });
    expect(parseHours('Пн–Пт 09:00–18:00')).toEqual({
      lateClose: null,
      weekends: false,
      everyDay: false,
      roundTheClock: false,
    });
    expect(parseHours('24/7')).toMatchObject({ roundTheClock: true });
    expect(parseHours('Mo-Su 10:00-22:30')).toMatchObject({ lateClose: '22:30', weekends: true });
    expect(parseHours('Mo-Fr 20:00-02:00')).toMatchObject({ lateClose: null });
    expect(parseHours(null)).toBeNull();
  });
});

describe('buildDossier', () => {
  it('считает соседей той же ниши в 2 км и у скольких есть сайт; без дублей и дальних', () => {
    const neighbors = neighborsOf([
      near(1, true),
      near(2, true),
      near(3, false),
      near(4, true, 0.1),
      cand(),
    ]);
    const d = buildDossier({
      candidate: cand(),
      neighbors,
      niche: 'dentist',
      nicheTitle: 'Стоматология',
      city: 'Казань',
    });
    expect(d.competitors).toEqual({ radiusKm: 2, sameNiche: 3, withSite: 2 });
    expect(d.channels).toEqual({ email: true, whatsapp: true, telegram: false });
    expect(d.facts).toContain('часы: пн-пт 09:00-21:00; сб 10:00-16:00');
    expect(d.gaps[0]).toBe('нет своего сайта');
    expect(parseDossier(JSON.stringify(d))).toEqual(d);
    expect(parseDossier('{"v":2}')).toBeNull();
    const noGeo = buildDossier({
      candidate: cand({ lat: null, lon: null, hours: null, email: null, whatsapp: null }),
      neighbors,
      niche: 'dentist',
      nicheTitle: 'Стоматология',
      city: null,
    });
    expect(noGeo.competitors).toBeNull();
    expect(noGeo.gaps).toEqual([
      'нет своего сайта',
      'в карточке нет часов работы',
      'кроме телефона, связаться не через что',
    ]);
  });
});

describe('offer', () => {
  const d = buildDossier({
    candidate: cand(),
    neighbors: neighborsOf([near(1, true), near(2, true), near(3, false)]),
    niche: 'dentist',
    nicheTitle: 'Стоматология',
    city: 'Казань',
  });

  it('подходящие заходы — только по фактам досье', () => {
    expect(applicableAngles(d)).toEqual([
      'competitors_have_sites',
      'open_late',
      'weekends',
      'whatsapp',
      'leads_to_email',
      'search',
    ]);
    expect(applicableAngles(null)).toEqual(['leads_to_email', 'search']);
    const lonely = buildDossier({
      candidate: cand({ hours: null, whatsapp: null }),
      neighbors: neighborsOf([near(1, false), near(2, false)]),
      niche: 'dentist',
      nicheTitle: 'Стоматология',
      city: 'Казань',
    });
    expect(applicableAngles(lonely)).toEqual(['first_in_area', 'leads_to_email', 'search']);
  });

  it('каждый заход даёт свою тему и вступление; цифры — только посчитанные', () => {
    const subjects = new Set<string>();
    for (const angle of applicableAngles(d)) {
      const o = buildOffer({ dossier: d, angle, companyName: 'Стоматология «Улыбка»' });
      subjects.add(o.subject);
      expect(o.bullets).toHaveLength(3);
      for (const digit of `${o.subject} ${o.opener} ${o.bullets.join(' ')}`.match(/\d+/g) ?? []) {
        expect(['2', '3', '21', '00', '10', '16', '09']).toContain(digit);
      }
      expect(`${o.subject} ${o.opener}`).not.toMatch(/лучш|гарантир|самы[ей] низк/i);
    }
    expect(subjects.size).toBe(applicableAngles(d).length);
    const comp = buildOffer({ dossier: d, angle: 'competitors_have_sites', companyName: 'Улыбка' });
    expect(comp.opener).toContain(
      'в 2 км ещё 3 компании той же сферы, и у 2 из них уже есть свой сайт',
    );
    expect(comp.packageKey).toBe('domen');
    expect(buildOffer({ dossier: d, angle: 'open_late', companyName: 'Улыбка' }).subject).toContain(
      'до 21:00',
    );
    expect(
      buildOffer({ dossier: null, angle: 'leads_to_email', companyName: 'Улыбка' }).subject,
    ).toBe('Улыбка: сделали вам страницу, заявки — вам на почту');
  });
});

describe('learning', () => {
  const stat = (
    angle: OfferAngle,
    sent: number,
    opened = 0,
    replied = 0,
    agreed = 0,
  ): AngleStat => ({ angle, sent, opened, replied, agreed });

  it('сначала недоиспытанные заходы, потом лучший, иногда — проба другого', () => {
    const applicable: OfferAngle[] = ['competitors_have_sites', 'whatsapp', 'leads_to_email'];
    const fresh = new Map([
      ['competitors_have_sites', stat('competitors_have_sites', 10, 5)],
      ['whatsapp', stat('whatsapp', 2)],
      ['leads_to_email', stat('leads_to_email', MIN_TRIALS + 3, 1)],
    ] as [OfferAngle, AngleStat][]);
    expect(chooseAngle(applicable, fresh, () => 0.99)).toBe('whatsapp');
    const tried = new Map([
      ['competitors_have_sites', stat('competitors_have_sites', 20, 10, 2)],
      ['whatsapp', stat('whatsapp', 20, 2)],
      ['leads_to_email', stat('leads_to_email', 20, 4)],
    ] as [OfferAngle, AngleStat][]);
    expect(chooseAngle(applicable, tried, () => 0.99)).toBe('competitors_have_sites');
    expect(chooseAngle(applicable, tried, () => 0.1)).not.toBe('competitors_have_sites');
    expect(chooseAngle([], tried)).toBe('leads_to_email');
  });

  it('оценка: ответ весит больше открытия, сглаживание не даёт одному письму победить', () => {
    expect(angleScore({ sent: 1, opened: 1, replied: 0, agreed: 0 })).toBeLessThan(
      angleScore({ sent: 20, opened: 12, replied: 1, agreed: 0 }),
    );
    const table = learningTable(
      new Map([['whatsapp', stat('whatsapp', 10, 5, 1)]] as [OfferAngle, AngleStat][]),
    );
    expect(table).toHaveLength(OFFER_ANGLES.length);
    expect(table[0]).toMatchObject({ angle: 'whatsapp', openRate: 0.5, replyRate: 0.1 });
  });
});
