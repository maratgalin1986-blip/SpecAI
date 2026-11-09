import { describe, expect, it } from 'vitest';
import { LANDING_LEAD_SOURCE, SITE_REQUEST_LIMITS, siteRequestMessage } from './siteRequest';

describe('LANDING_LEAD_SOURCE', () => {
  it('источник заявки страницы услуги', () => {
    expect(LANDING_LEAD_SOURCE).toBe('sajt-pod-klyuch');
  });
});

describe('siteRequestMessage', () => {
  it('чем занимаемся и город, пробелы схлопнуты', () => {
    expect(siteRequestMessage({ business: '  стоматология \n детская ', city: ' Казань ' })).toBe(
      'Хочу сайт под ключ.\nЧем занимаемся: стоматология детская\nГород: Казань',
    );
  });

  it('пустые поля пропускаются', () => {
    expect(siteRequestMessage({})).toBe('Хочу сайт под ключ.');
    expect(siteRequestMessage({ business: ' ', city: 'Уфа' })).toBe(
      'Хочу сайт под ключ.\nГород: Уфа',
    );
  });

  it('длинные поля обрезаются, итог в пределах 1000 символов', () => {
    const message = siteRequestMessage({ business: 'а'.repeat(5000), city: 'б'.repeat(5000) });
    expect(message.length).toBeLessThanOrEqual(1000);
    expect(message).toContain(`Чем занимаемся: ${'а'.repeat(SITE_REQUEST_LIMITS.business)}\n`);
    expect(message.endsWith(`Город: ${'б'.repeat(SITE_REQUEST_LIMITS.city)}`)).toBe(true);
  });
});
