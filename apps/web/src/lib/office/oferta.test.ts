import { describe, expect, it } from 'vitest';
import { EXPIRING_DAYS } from './billing';
import { LANDING_PATH, landingFaq } from './landing';
import { OFERTA_EDITION, OFERTA_PATH, OFERTA_SUSPEND_DAYS, ofertaSections } from './oferta';
import { sitePackages } from '@/lib/prices';
import { SITE } from '@/lib/site';

const sections = () => ofertaSections({ serviceUrl: 'https://example.ru/sajt-pod-klyuch' });
const text = () =>
  sections()
    .flatMap((s) => [s.title, ...s.items])
    .join('\n');

describe('публичная оферта «Сайт под ключ» (К9)', () => {
  it('лежит под страницей услуги и датирована', () => {
    expect(OFERTA_PATH).toBe(`${LANDING_PATH}/oferta`);
    expect(OFERTA_EDITION).toMatch(/^\d{1,2} [а-я]+ \d{4} года$/);
  });

  it('называет исполнителя с реквизитами, акцепт оплатой счёта и страницу услуги', () => {
    const all = text();
    for (const fact of [SITE.legalName, SITE.inn, SITE.kpp, SITE.ogrn, SITE.legalAddress]) {
      expect(all).toContain(fact);
    }
    expect(all).toContain('пункт 3 статьи 438');
    expect(all).toContain('https://example.ru/sajt-pod-klyuch');
    expect(all).toContain('юридическим лицам и индивидуальным предпринимателям');
  });

  it('ставку НДС не называет — её называет счёт, чтобы оферта и счёт не расходились', () => {
    const all = text();
    expect(all).toContain('включает ли она НДС и по какой ставке');
    expect(all).not.toMatch(/НДС[^.]*\d+\s*%/);
  });

  it('не расходится с тем, что делает офис и обещает страница услуги', () => {
    const all = text();
    // Счёт за сайт включает первый месяц (invoiceDue), поддержка — за месяц или за 12 месяцев.
    expect(all).toContain('входит первый месяц работы и поддержки');
    expect(all).toContain('за месяц или сразу за 12 месяцев');
    // Домен оформляется на клиента (пакет «Сайт на своём домене»).
    const domainPackage = sitePackages({ setup: 3900, monthly: 990 }).find(
      (p) => p.key === 'domen',
    );
    expect(domainPackage?.includes.join(' ')).toContain('Домен оформляется на вас');
    expect(all).toContain('Домен оформляется на Заказчика');
    // Отказ в любой день и «платить дальше не нужно» — как в вопросах страницы услуги.
    const faq = landingFaq({ setup: 3900, monthly: 990 })
      .map((item) => item.a)
      .join(' ');
    expect(faq).toContain('платить дальше не нужно');
    expect(all).toContain('платить дальше не нужно');
    expect(faq).toContain('публичной оферте');
    // Сайт не снимают раньше, чем счёт на продление вообще появился.
    expect(OFERTA_SUSPEND_DAYS).toBeGreaterThanOrEqual(EXPIRING_DAYS);
    // Обещаний результата нет.
    expect(all).toContain('не обещает определённого числа обращений');
  });

  it('обработка заявок посетителей — по поручению заказчика, с составом данных и сроком удаления', () => {
    const all = text();
    expect(all).toContain('часть 3 статьи 6');
    expect(all).toContain('имя, телефон и текст сообщения');
    expect(all).toMatch(/при прекращении договора — в течение \d+ дней/);
  });

  it('разделы и пункты непустые, без повторов', () => {
    const list = sections();
    expect(list.length).toBeGreaterThanOrEqual(9);
    const items = list.flatMap((s) => s.items);
    expect(items.every((item) => item.trim().length > 20)).toBe(true);
    expect(new Set(items).size).toBe(items.length);
  });
});
