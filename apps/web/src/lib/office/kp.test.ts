import { describe, expect, it } from 'vitest';
import type { Dossier } from './dossier';
import { buildKp, kpStats, kpUrl } from './kp';

const dossier: Dossier = {
  v: 1,
  niche: 'car_repair',
  nicheTitle: 'Автосервис',
  city: 'Казань',
  facts: [],
  hours: { lateClose: '21:00', weekends: true, roundTheClock: false },
  competitors: { radiusKm: 2, sameNiche: 7, withSite: 3 },
  channels: { email: true, whatsapp: true, telegram: false },
  gaps: ['нет сайта'],
};
const offer = {
  opener: 'Рядом с вами 7 автосервисов, у 3 уже есть сайт.',
  bullets: ['Первый', 'Второй', 'Третий'],
  packageKey: 'domen' as const,
  packageReason: 'у соседей сайты на своих доменах',
};
const prices = { setup: 3900, monthly: 990, yearly: 9900 };

describe('коммерческое предложение /kp/<token>', () => {
  it('цифры — только посчитанные по досье, не больше трёх', () => {
    expect(kpStats(dossier)).toEqual([
      { value: '7', label: 'компаний вашей сферы в 2 км от вас' },
      { value: '3', label: 'из них уже со своим сайтом' },
      { value: '21:00', label: 'до этого часа вы работаете' },
    ]);
    expect(kpStats(null)).toEqual([]);
    expect(kpStats({ ...dossier, competitors: null, hours: null })).toEqual([]);
  });

  it('ни у кого рядом нет сайта — «можете быть первыми», без выдуманных чисел', () => {
    const stats = kpStats({
      ...dossier,
      hours: null,
      competitors: { radiusKm: 2, sameNiche: 1, withSite: 0 },
    });
    expect(stats[0]).toEqual({ value: '1', label: 'компания вашей сферы в 2 км от вас' });
    expect(stats[1]!.label).toContain('первыми');
  });

  it('пакеты с ценами из настроек, рекомендованный отмечен; название в кавычках один раз', () => {
    const kp = buildKp({ name: 'Мотор', city: ' Казань ', dossier, offer, prices });
    expect(kp.company).toBe('«Мотор»');
    expect(kp.city).toBe('Казань');
    expect(kp.packages.map((p) => [p.key, p.setup, p.recommended])).toEqual([
      ['vizitka', 3900, false],
      ['domen', 5900, true],
    ]);
    expect(kp.bullets).toEqual(offer.bullets);
    expect(buildKp({ name: 'Салон «Лотос»', city: null, dossier, offer, prices }).company).toBe(
      'Салон «Лотос»',
    );
    expect(JSON.stringify(kp)).not.toMatch(/лучш|гарантир|самы[йех]/i);
  });

  it('ссылка на страницу — по токену', () => {
    expect(kpUrl('https://example.test/', 'abc')).toBe('https://example.test/kp/abc');
  });
});
