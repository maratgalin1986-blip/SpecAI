import { describe, expect, it } from 'vitest';
import { SITE } from '@/lib/site';
import { buildSitePolicy, SITE_LEAD_RETENTION_MONTHS } from './sitePolicy';

const company = {
  name: 'Стоматология «Улыбка»',
  address: 'ул. Баумана, 10',
  city: 'Казань',
  phone: '+7 843 212-34-56',
};

describe('buildSitePolicy (К17)', () => {
  const policy = buildSitePolicy(company, SITE);
  const text = JSON.stringify(policy);

  it('the company is the operator, with its name and address from the card', () => {
    expect(policy.title).toBe(
      'Политика обработки персональных данных посетителей сайта Стоматология «Улыбка»',
    );
    expect(policy.sections[0]!.paragraphs[0]).toBe(
      'Оператор персональных данных — Стоматология «Улыбка», адрес: Казань, ул. Баумана, 10, телефон: +7 843 212-34-56.',
    );
  });

  it("the platform processes on the company's behalf, with its legal details", () => {
    for (const part of [SITE.legalName, SITE.inn, SITE.ogrn, SITE.legalAddress]) {
      expect(text).toContain(part);
    }
    expect(text).toMatch(/по поручению оператора/i);
  });

  it('names the data, the purpose, storage in Russia, the term and how to withdraw consent', () => {
    for (const part of [
      'имя, телефон и комментарий',
      'ответить на вашу заявку',
      'в России',
      `${SITE_LEAD_RETENTION_MONTHS} месяцев`,
      'отозвать согласие',
      SITE.email,
    ]) {
      expect(text).toContain(part);
    }
    expect(policy.sections.map((s) => s.title)).toHaveLength(6);
  });

  it('without an address — the city, without both — a neutral line; no duplicate city', () => {
    const noAddress = buildSitePolicy({ ...company, address: null }, SITE);
    expect(noAddress.sections[0]!.paragraphs[0]).toContain('адрес: Казань,');
    const nothing = buildSitePolicy({ ...company, address: null, city: null }, SITE);
    expect(nothing.sections[0]!.paragraphs[0]).toContain('адрес: указан в карточке компании');
    const withCity = buildSitePolicy({ ...company, address: 'Казань, ул. Баумана, 10' }, SITE);
    expect(withCity.sections[0]!.paragraphs[0]).toContain('адрес: Казань, ул. Баумана, 10,');
  });
});
