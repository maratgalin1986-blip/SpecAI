import { describe, expect, it } from 'vitest';
import {
  HIDDEN_ADDRESS,
  HIDDEN_CONTACT,
  HIDDEN_LINK,
  containsContact,
  canSeeChatContacts,
  canSeeCustomerName,
  isHttpsUrl,
  isSafeHttpUrl,
  maskContacts,
  maskMessagesForAi,
  maskOrderText,
  orderDescriptionFor,
  orderTextForViewer,
  orderTextWithoutAddress,
  visibleBids,
} from './privacy';

describe('maskContacts', () => {
  it('masks phones written with dots, underscores, slashes and long dashes', () => {
    for (const phone of [
      '8.917.444.55.66',
      '+7 917 444.55.66',
      '8\u2014917\u2014444\u201455\u201466',
      '8_917_444_55_66',
      '8/917/444/55/66',
      '+7\u00b7917\u00b7444\u00b755\u00b766',
    ]) {
      expect(maskContacts(`звоните ${phone}, жду`)).toBe(`звоните ${HIDDEN_CONTACT}, жду`);
    }
  });

  it('masks a phone written next to a date and keeps the date', () => {
    expect(maskContacts('Тел 89174445566 12.10.2026')).toBe(`Тел ${HIDDEN_CONTACT} 12.10.2026`);
    expect(maskContacts('12.10.2026 89174445566')).toBe(`12.10.2026 ${HIDDEN_CONTACT}`);
    expect(maskContacts('+7 (917) 444-55-66 12.10.2026')).toContain('12.10.2026');
    expect(maskContacts('+7 (917) 444-55-66 12.10.2026')).not.toContain('444');
  });

  it('masks commas, pipes and asterisks, and a phone right after a word', () => {
    for (const phone of ['8,917,444,55,66', '8|917|444|55|66', '8*917*444*55*66']) {
      expect(maskContacts(`звоните ${phone}`)).toBe(`звоните ${HIDDEN_CONTACT}`);
    }
    expect(maskContacts('AUDIT3 8.917.444.55.66')).toBe(`AUDIT3 ${HIDDEN_CONTACT}`);
  });

  it('leaves coordinates, sums and date ranges alone', () => {
    for (const text of [
      'Координаты 55.7436 52.3959',
      'Бюджет 1.200.000.000 руб',
      'Смены 12.10-15.10 и 20.10-25.10 2026',
      'смены 1, 2, 3, 4, 5, 6, 7, 8, 9, 10',
    ]) {
      expect(maskContacts(text)).toBe(text);
    }
  });

  it('leaves dates and date ranges readable', () => {
    for (const text of [
      'с 12.10.2026 - 15.10',
      'на 01.06.2028',
      '12.10.2026 08:00',
      'смены 12.10-15.10',
    ]) {
      expect(maskContacts(text)).toBe(text);
    }
  });

  it('hides phone numbers in any common format', () => {
    for (const phone of [
      '89170001122',
      '+79170001122',
      '8 (917) 000-11-22',
      '+7 917 000 11 22',
      '8-917-000-11-22',
      '242-80-88',
    ]) {
      const masked = maskContacts(`Нужен кран, тел ${phone}, звоните`);
      expect(masked).toBe(`Нужен кран, тел ${HIDDEN_CONTACT}, звоните`);
    }
  });

  it('hides e-mails, @usernames and messenger links', () => {
    expect(maskContacts('пишите ivan.petrov@mail.ru')).toBe(`пишите ${HIDDEN_CONTACT}`);
    expect(maskContacts('в личку @ivan_kran16')).toBe(`в личку ${HIDDEN_CONTACT}`);
    expect(maskContacts('@ivan_kran16 нужен кран')).toBe(`${HIDDEN_CONTACT} нужен кран`);
    expect(maskContacts('t.me/ivan_kran16 или https://wa.me/79170001122')).toBe(
      `${HIDDEN_CONTACT} или ${HIDDEN_CONTACT}`,
    );
  });

  it('keeps dates, sizes, tonnage and prices', () => {
    const text =
      'Нужен экскаватор-погрузчик 01.06.2028, траншея 20 м, автокран 25 т, до 30000 руб, 2027-03-10';
    expect(maskContacts(text)).toBe(text);
  });

  it('masks the example from the acceptance report', () => {
    const text =
      'Нужен экскаватор-погрузчик завтра, Набережные Челны, траншея 20 м, тел 89170001122';
    expect(maskContacts(text)).not.toContain('89170001122');
    expect(maskContacts(text)).toContain('траншея 20 м');
  });
});

describe('maskMessagesForAi', () => {
  it('hides phones and e-mails in every message before the AI provider', () => {
    const masked = maskMessagesForAi([
      { role: 'user' as const, content: 'Экскаватор на завтра, мой номер +7 900 000-00-00' },
      { role: 'assistant' as const, content: 'Принял. Оставьте телефон.' },
      { role: 'user' as const, content: 'Городской 8 (8552) 12-34-56, почта Ivan.Petrov@mail.ru' },
      { role: 'user' as const, content: '+7 843 123 45 67, 89000000000' },
    ]);
    expect(masked.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'user']);
    const text = masked.map((m) => m.content).join(' ');
    expect(text).not.toMatch(/\d{3}[\s-]?\d{2}[\s-]?\d{2}/);
    expect(text).not.toContain('@');
    expect(masked[0]?.content).toBe(`Экскаватор на завтра, мой номер ${HIDDEN_CONTACT}`);
  });

  it('keeps dates, sums and sizes and does not mutate the input', () => {
    const input = [
      { role: 'user' as const, content: 'С 01.06.2028, 8 часов, 3500 ₽, яма 10x20 м' },
    ];
    expect(maskMessagesForAi(input)[0]?.content).toBe(input[0]?.content);
    expect(maskMessagesForAi(input)[0]).not.toBe(input[0]);
  });
});

describe('url checks', () => {
  it('accepts only http and https', () => {
    expect(isSafeHttpUrl('https://t.me/chat/1')).toBe(true);
    expect(isSafeHttpUrl('http://example.com')).toBe(true);
    expect(isSafeHttpUrl('javascript:alert(document.cookie)')).toBe(false);
    expect(isSafeHttpUrl('JavaScript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,<script>1</script>')).toBe(false);
    expect(isSafeHttpUrl('/relative')).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
  });

  it('https only for images', () => {
    expect(isHttpsUrl('https://x.public.blob.vercel-storage.com/a.jpg')).toBe(true);
    expect(isHttpsUrl('http://example.com/a.jpg')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('visibleBids', () => {
  const bids = [
    { id: 'b1', equipment: { companyId: 'c1' } },
    { id: 'b2', equipment: { companyId: 'c2' } },
  ];

  it('shows all bids to the order owner and admins', () => {
    expect(visibleBids(bids, { userId: 'u1' }, 'u1')).toHaveLength(2);
    expect(visibleBids(bids, { isAdmin: true }, 'u1')).toHaveLength(2);
    expect(visibleBids(bids, { userId: 'a', role: 'PLATFORM_ADMIN' }, 'u1')).toHaveLength(2);
  });

  it('shows a provider only the bids of their company', () => {
    const own = visibleBids(bids, { userId: 'p', role: 'PROVIDER_ADMIN', companyId: 'c2' }, 'u1');
    expect(own.map((b) => b.id)).toEqual(['b2']);
  });

  it('shows nothing to anonymous visitors and other customers', () => {
    expect(visibleBids(bids, {}, 'u1')).toEqual([]);
    expect(visibleBids(bids, { userId: 'u2', role: 'CUSTOMER' }, 'u1')).toEqual([]);
  });
});

describe('who sees personal data', () => {
  it('customer name: owner and admins only', () => {
    expect(canSeeCustomerName({}, 'u1')).toBe(false);
    expect(canSeeCustomerName({ userId: 'u2', role: 'PROVIDER_ADMIN' }, 'u1')).toBe(false);
    expect(canSeeCustomerName({ userId: 'u1' }, 'u1')).toBe(true);
    expect(canSeeCustomerName({ isAdmin: true }, 'u1')).toBe(true);
  });

  it('chat contacts: admins and providers with a confirmed e-mail', () => {
    expect(canSeeChatContacts({})).toBe(false);
    expect(canSeeChatContacts({ role: 'CUSTOMER', emailVerified: true })).toBe(false);
    expect(canSeeChatContacts({ role: 'PROVIDER_ADMIN', emailVerified: false })).toBe(false);
    expect(canSeeChatContacts({ role: 'PROVIDER_ADMIN', emailVerified: true })).toBe(true);
    expect(canSeeChatContacts({ isAdmin: true })).toBe(true);
  });

  it('masks descriptions of imported orders for everyone else', () => {
    const imported = { description: 'кран, тел 89170001122', source: 'TELEGRAM' };
    expect(orderDescriptionFor(imported, {})).toBe(`кран, тел ${HIDDEN_CONTACT}`);
    expect(orderDescriptionFor(imported, { isAdmin: true })).toBe(imported.description);
    const site = { description: 'мой тел 89170001122', source: 'SITE' };
    expect(orderDescriptionFor(site, {})).toBe(site.description);
  });
});

describe('containsContact', () => {
  it('finds phones, e-mails and handles in a machine name, not model codes', () => {
    expect(containsContact('Самосвал тел 89173334455')).toBe(true);
    expect(containsContact('Кран 8.917.333.44.55')).toBe(true);
    expect(containsContact('Кран, пишите ivan@mail.ru')).toBe(true);
    expect(containsContact('КамАЗ 65115-6058-48')).toBe(false);
    expect(containsContact('Hitachi ZX200-5G 2019')).toBe(false);
  });
});

describe('maskOrderText', () => {
  const A = HIDDEN_ADDRESS;

  it('hides a street with a house and keeps the rest of the task', () => {
    const cases: [string, string][] = [
      ['Нужен кран, ул. Мира, д. 15, завтра', `Нужен кран, ${A}, завтра`],
      ['ул.Мира,15', A],
      ['пр-т Сююмбике 40', A],
      ['проспект Мира 52/16, подъезд 3', A],
      ['улица 40 лет Победы, 12', A],
      ['ул мира 15 нужен экскаватор', `${A} нужен экскаватор`],
      ['улица ленина 5а', A],
      ['Московский проспект, 15', A],
      ['Сармановский тракт, 60', A],
      ['Мира проспект 40', A],
      ['пер. Садовый 3', A],
      ['б-р Энтузиастов, 9', A],
      ['шоссе Энтузиастов 12', A],
      ['мкр. Яшьлек, д. 4', A],
      ['Ул. Академика Королёва д.3 корп.2', A],
      ['улица Гагарина', A],
      ['ЖК «Солнечный», дом 2', A],
      ['СНТ Ромашка, участок 15', A],
      ['ул. Мира 15, кран 25 т на 2 смены', `${A}, кран 25 т на 2 смены`],
      ['на улице Ленина 2 дня работы', `на ${A} 2 дня работы`],
    ];
    for (const [text, masked] of cases) expect(maskOrderText(text), text).toBe(masked);
  });

  it('hides a house, a flat and a building written without a street', () => {
    expect(maskOrderText('дом 7 кв 12')).toBe(A);
    expect(maskOrderText('д. 15, кв. 3')).toBe(A);
    expect(maskOrderText('дом 15к2, со двора')).toBe(`${A}, со двора`);
    expect(maskOrderText('заезд к корпусу 2')).toBe(`заезд к ${A}`);
    expect(maskOrderText('корпус 2, офис 14')).toBe(A);
  });

  it('hides the addresses of Набережные Челны: complexes and «ГЭС 10/25»', () => {
    expect(maskOrderText('52 комплекс, д. 12')).toBe(A);
    expect(maskOrderText('в 17А комплексе дом 3')).toBe(`в ${A}`);
    expect(maskOrderText('комплекс 52')).toBe(A);
    expect(maskOrderText('ГЭС 10/25')).toBe(A);
    expect(maskOrderText('Новый город 30/05, разгрузить плиты')).toBe(`${A}, разгрузить плиты`);
    expect(maskOrderText('пос. ЗЯБ, 17/04')).toBe(`пос. ${A}`);
  });

  it('hides the whole «Адрес: …» line and what follows «по адресу»', () => {
    expect(maskOrderText('Адрес: Набережные Челны, Мира 15\nНужен кран 25 т')).toBe(
      `Адрес: ${A}\nНужен кран 25 т`,
    );
    expect(maskOrderText('Адрес объекта — Сармановский тракт 60, въезд с торца')).toBe(
      `Адрес объекта — ${A}`,
    );
    expect(maskOrderText('Копать по адресу: Мира 15, двор')).toBe(`Копать по адресу: ${A}`);
    expect(maskOrderText('работы по адресу Мира 15 на 2 смены')).toBe(
      `работы по адресу ${A} на 2 смены`,
    );
    expect(maskOrderText('адрес уточню при звонке')).toBe('адрес уточню при звонке');
  });

  it('keeps the city', () => {
    expect(maskOrderText('Казань, ул. Хади Такташа 85к2, кв. 7')).toBe(`Казань, ${A}`);
    expect(maskOrderText('Елабуга, Окружное шоссе 7')).toBe(`Елабуга, ${A}`);
    for (const text of [
      'Набережные Челны',
      'Набережные Челны, кран 16 т',
      'г. Елабуга, манипулятор 5 т',
      'д. Калмаш, нужен трактор',
      'Нижнекамск — Казань, перевезти экскаватор',
    ]) {
      expect(maskOrderText(text), text).toBe(text);
    }
  });

  it('leaves volumes, tonnage, hours, sizes and prices alone', () => {
    for (const text of [
      'нужен кран на 25 т',
      '10 часов',
      '2 смены',
      'глубина 1,5 м',
      'КамАЗ 6520',
      'КамАЗ 65115',
      '15 кубов',
      'Нужен автокран 25 т на 10 часов, 2 смены, глубина 1,5 м, КамАЗ 6520',
      'траншея 100 м, ширина 0,6 м',
      'вывезти 20 м3 грунта',
      'ковш 0,8 куба',
      'стрела 28 м, 16 т',
      'бетон М300 5 кубов',
      'экскаватор-погрузчик JCB 3CX на 2 дня',
      'цена до 2500 р/час',
      'бюджет 15 000 руб',
      'оплата 3000 в час',
      'с 8:00 до 17:00',
      '12.11.2026 с утра',
      'Работаем 24/7',
      'нужно 2 машины на 3 рейса',
      'до 5 этажа поднять 3 поддона',
      'участок 15 соток',
      'площадь участка 600 кв. м',
      'площадь 200 м2',
      'кв. м плитки 40',
      'снести дом 6 на 8',
      'дом 6х8 под снос',
      'дом 2 этажа, поднять плиты',
      'дом 120 м2, фундамент',
      'дом из бруса, 2 дня работы',
    ]) {
      expect(maskOrderText(text), text).toBe(text);
    }
  });

  it('leaves plain speech about streets and driveways alone', () => {
    for (const text of [
      'на улице минус 20, нужен тепловой обогрев',
      'работа на улице, 3 дня',
      'проезд узкий, 3 метра',
      'Нужен проезд для техники 4 м',
      'Узкий проезд, нужен мини-погрузчик',
      'проезд КамАЗа свободный, площадка ровная',
      'подъезд к участку свободный',
      'на шоссе авария, эвакуатор',
      'на проспекте работаем 2 смены',
      'Нужен самосвал 20 т. Улица сухая',
      'комплекс работ по благоустройству',
      '2 комплекса работ',
      'в 3 квартале планируем стройку',
      'корпус насоса заменить',
      'стр. 3 договора',
    ]) {
      expect(maskOrderText(text), text).toBe(text);
    }
  });

  it('hides contacts and links as before', () => {
    expect(maskOrderText('ул. Мира 15 89174445566')).toBe(`${A} ${HIDDEN_CONTACT}`);
    expect(maskOrderText('пишите t.me/stroyka или на site.ru, кран 25 т')).toBe(
      `пишите ${HIDDEN_CONTACT} или на ${HIDDEN_LINK}, кран 25 т`,
    );
  });

  it('answers at once on a long text', () => {
    const long = 'ул. Мира дом улица проспект 15 т 2 смены, '.repeat(50);
    const started = Date.now();
    maskOrderText(long);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('orderTextWithoutAddress', () => {
  it('drops the address without a mark and keeps the job on one line', () => {
    expect(orderTextWithoutAddress('ул. Строителей, д. 7 — разгрузить плиты, 25 т')).toBe(
      'разгрузить плиты, 25 т',
    );
    expect(orderTextWithoutAddress('Кран 25 т, ул. Мира 15, завтра')).toBe('Кран 25 т, завтра');
    expect(orderTextWithoutAddress('Адрес: Челны, Мира 15\nНужен кран 25 т')).toBe(
      'Нужен кран 25 т',
    );
    expect(orderTextWithoutAddress('Копать траншею 100 м, звоните 89174445566')).toBe(
      `Копать траншею 100 м, звоните ${HIDDEN_CONTACT}`,
    );
  });
});

describe('orderTextForViewer', () => {
  const text = 'Кран 25 т, ул. Мира, д. 15, звоните 89174445566';

  it('gives the whole text to the author, the admin and the booked company', () => {
    expect(orderTextForViewer(text, { full: true })).toBe(text);
  });

  it('hides contacts and the address for every other viewer', () => {
    expect(orderTextForViewer(text, { full: false })).toBe(
      `Кран 25 т, ${HIDDEN_ADDRESS}, звоните ${HIDDEN_CONTACT}`,
    );
  });

  it('keeps the address for a viewer who reads the location in full', () => {
    expect(orderTextForViewer(text, { full: false, address: true })).toBe(
      `Кран 25 т, ул. Мира, д. 15, звоните ${HIDDEN_CONTACT}`,
    );
  });
});
