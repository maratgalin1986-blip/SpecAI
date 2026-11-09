import { describe, expect, it } from 'vitest';
import { PLATFORM_PROMISE } from '@specai/shared';
import { SITE } from '@/lib/site';
import {
  buildEmail,
  buildFollowUpEmail,
  buildWhatsAppText,
  isRuMobile,
  isStopReply,
  LEADS_TO_EMAIL_LINE,
  pickChannels,
  SERVICE_LINK_LABEL,
  serviceUrl,
  STOP_LINE,
  UNSUBSCRIBE_LABEL,
  WHATSAPP_MAX_LENGTH,
  whatsappTarget,
  type OutreachContact,
  type OutreachInput,
  type OutreachProspect,
} from './outreach';

const site: OutreachProspect = {
  kind: 'site',
  status: 'READY',
  slug: 'stomatologiya-ulybka-kazan',
  name: 'Стоматология «Улыбка»',
  phone: '+78432001122',
  address: 'ул. Баумана, 1',
  city: 'Казань',
  lat: null,
  lon: null,
  tags: null,
  hours: 'Mo-Fr 09:00-20:00',
  email: 'info@ulybka.example',
};

const provider: OutreachProspect = {
  ...site,
  kind: 'provider',
  slug: 'tekhstroy-chelny',
  name: 'ООО «ТехСтрой»',
  phone: '+79270000000',
  city: 'Набережные Челны',
  tags: 'excavator,dump-truck',
};

const BASE = 'https://xn--24-6kc5aagh4arjl.xn--p1ai';

const input: OutreachInput = {
  previewUrl: `${BASE}/preview/tok123`,
  baseUrl: BASE,
  prices: { setup: 15000, monthly: 1500 },
  nicheTitle: 'Стоматология',
  replyTo: 'office@example.com',
};

const FORBIDDEN = /лучш|гарантир|самые|самый|самая/i;

const SERVICE_EMAIL = `${BASE}/sajt-pod-klyuch?utm_source=email&utm_campaign=stomatologiya-ulybka-kazan`;
const SERVICE_WHATSAPP = `${BASE}/sajt-pod-klyuch?utm_source=whatsapp&utm_campaign=stomatologiya-ulybka-kazan`;

/** The stop line is the last thing the reader sees before the signature. */
function stopLineIsLast(text: string) {
  const lines = text.trim().split('\n').filter(Boolean);
  expect(lines[lines.length - 2]).toContain(STOP_LINE);
  expect(lines[lines.length - 1]).toMatch(/^— /);
}

describe('serviceUrl', () => {
  it('points to the service page with the channel and the prospect slug as labels', () => {
    expect(serviceUrl(BASE, 'email', 'stomatologiya-ulybka-kazan')).toBe(SERVICE_EMAIL);
    expect(serviceUrl(`${BASE}/`, 'whatsapp', 'stomatologiya-ulybka-kazan')).toBe(SERVICE_WHATSAPP);
    // A slug is [a-z0-9-] by construction; anything else is still encoded, never raw.
    expect(serviceUrl('https://example.test', 'email', 'a&b c')).toBe(
      'https://example.test/sajt-pod-klyuch?utm_source=email&utm_campaign=a%26b+c',
    );
  });
});

describe('buildEmail', () => {
  it('site letter: subject, who we are, link, prices, stop line last', () => {
    const letter = buildEmail(site, input);
    expect(letter.subject).toBe('Сделали страницу для Стоматология «Улыбка» — посмотрите');
    expect(letter.text).toContain(SITE.name);
    expect(letter.text).toContain(SITE.platform);
    expect(letter.text).toContain('в городе Казань');
    expect(letter.text).toContain('стоматология');
    expect(letter.text).toContain(input.previewUrl);
    expect(letter.text).toContain('15 000 ₽');
    expect(letter.text).toContain('1 500 ₽');
    expect(letter.text).toContain(`позвоните ${SITE.phone}`);
    expect(letter.text).toContain(
      `${STOP_LINE} Адрес — из открытой карточки компании; если не ответите, напомним один раз, не больше.`,
    );
    stopLineIsLast(letter.text);
    expect(letter.text).not.toMatch(FORBIDDEN);
    expect(letter.html).not.toMatch(FORBIDDEN);
  });

  it('site letter: «Кто мы и цены» link to the service page and leads to the company mail', () => {
    const letter = buildEmail(site, input);
    expect(letter.text).toContain(`${SERVICE_LINK_LABEL}: ${SERVICE_EMAIL}`);
    // The preview has no lead form yet (К10): the letter promises it after the site is connected.
    expect(letter.text).toContain('После подключения добавим форму заявки: заявки с сайта');
    expect(letter.text).toContain('на почту — на этот адрес.');
    expect(letter.text).not.toContain('Написать в WhatsApp');
    // The service link comes after the preview link and before the closing lines.
    const text = letter.text;
    expect(text.indexOf(input.previewUrl)).toBeLessThan(text.indexOf(SERVICE_EMAIL));
    expect(text.indexOf(SERVICE_EMAIL)).toBeLessThan(text.indexOf(STOP_LINE));
    // In html the link is escaped (&amp;) and labelled.
    expect(letter.html).toContain(
      `<a href="${SERVICE_EMAIL.replace('&', '&amp;')}">${SERVICE_LINK_LABEL}</a>`,
    );
    expect(letter.html.toLowerCase()).toContain(LEADS_TO_EMAIL_LINE.toLowerCase());
    expect(letter.html.indexOf(SERVICE_LINK_LABEL)).toBeLessThan(letter.html.indexOf(STOP_LINE));
  });

  it('provider letter: platform, promise, link, how to go online, stop line', () => {
    const letter = buildEmail(provider, input);
    expect(letter.subject).toBe(`Ваша страница на ${SITE.platform} уже готова`);
    expect(letter.text).toContain('по всей России');
    expect(letter.text).toContain(PLATFORM_PROMISE);
    expect(letter.text).toContain(input.previewUrl);
    expect(letter.text).toContain('заказывать у вас напрямую');
    expect(letter.text).toContain('«Это моя компания»');
    expect(letter.text).toContain(STOP_LINE);
    // No site prices in the provider letter: the page is free for them.
    expect(letter.text).not.toContain('₽');
    expect(letter.text).not.toMatch(FORBIDDEN);
    // The site service is not offered to machinery providers.
    expect(letter.text).not.toContain('sajt-pod-klyuch');
    expect(letter.text).not.toContain(SERVICE_LINK_LABEL);
    expect(letter.html).not.toContain('sajt-pod-klyuch');
    stopLineIsLast(letter.text);
  });

  it('html is one column with a button link and escaped text, no images', () => {
    const letter = buildEmail({ ...site, name: 'ИП <Иванов> & Ко' }, input);
    expect(letter.html).toContain(`<a href="${input.previewUrl}"`);
    expect(letter.html).toContain('ИП &lt;Иванов&gt; &amp; Ко');
    expect(letter.html).not.toContain('<Иванов>');
    expect(letter.html).not.toContain('<img');
    expect(letter.html).toContain('<!doctype html>');
    expect(letter.html).toContain(STOP_LINE);
  });

  it('without a city the «в городе» tail is dropped', () => {
    const letter = buildEmail({ ...site, city: null }, input);
    expect(letter.text).not.toContain('в городе');
    expect(letter.text).toContain('на карте:');
  });
});

describe('buildFollowUpEmail', () => {
  it('site reminder: short, what we made, preview and service links, stop line last', () => {
    const letter = buildFollowUpEmail(site, input);
    expect(letter.subject).toBe('Напоминаем: страница для Стоматология «Улыбка» готова');
    expect(letter.text).toContain(SITE.name);
    expect(letter.text).toContain('Недавно мы писали вам');
    expect(letter.text).toContain('сделали страницу для Стоматология «Улыбка»');
    expect(letter.text).toContain('Посмотрите — это 30 секунд.');
    expect(letter.text).toContain(LEADS_TO_EMAIL_LINE);
    expect(letter.text).toContain(`Открыть страницу: ${input.previewUrl}`);
    expect(letter.text).toContain(`${SERVICE_LINK_LABEL}: ${SERVICE_EMAIL}`);
    expect(letter.text).toContain(`позвоните ${SITE.phone}`);
    expect(letter.text).toContain(`${STOP_LINE} Это единственное напоминание.`);
    stopLineIsLast(letter.text);
    // Shorter than the first letter, and no prices: they are behind «Кто мы и цены».
    expect(letter.text.length).toBeLessThan(buildEmail(site, input).text.length);
    expect(letter.text).not.toContain('₽');
    expect(letter.text).not.toMatch(FORBIDDEN);
    expect(letter.html).not.toMatch(FORBIDDEN);
    expect(letter.html).toContain(`<a href="${input.previewUrl}"`);
    expect(letter.html).toContain(STOP_LINE);
  });

  it('provider reminder: the page on the platform and how to claim it, no site offer', () => {
    const letter = buildFollowUpEmail(provider, input);
    expect(letter.subject).toBe(`Напоминаем: ваша страница на ${SITE.platform} готова`);
    expect(letter.text).toContain('страницу исполнителя');
    expect(letter.text).toContain('«Это моя компания»');
    expect(letter.text).toContain(input.previewUrl);
    expect(letter.text).not.toContain('₽');
    expect(letter.text).not.toContain('sajt-pod-klyuch');
    expect(letter.text).not.toMatch(FORBIDDEN);
    stopLineIsLast(letter.text);
  });

  it('escapes the company name in html', () => {
    const letter = buildFollowUpEmail({ ...site, name: 'ИП <Иванов> & Ко' }, input);
    expect(letter.html).toContain('ИП &lt;Иванов&gt; &amp; Ко');
    expect(letter.html).not.toContain('<Иванов>');
  });
});

describe('buildWhatsAppText', () => {
  it('is short, has the link, the prices (site) and the stop line', () => {
    const text = buildWhatsAppText(site, input);
    expect(text.length).toBeLessThanOrEqual(WHATSAPP_MAX_LENGTH);
    expect(text).toContain(SITE.name);
    expect(text).toContain(input.previewUrl);
    expect(text).toContain('15 000 ₽');
    expect(text).toContain(`${SERVICE_LINK_LABEL}: ${SERVICE_WHATSAPP}`);
    expect(text).toContain(`${LEADS_TO_EMAIL_LINE}.`);
    expect(text).not.toContain('utm_source=email');
    expect(
      text.trim().endsWith('Сообщение отправлено один раз на номер из открытой карточки компании.'),
    ).toBe(true);
    expect(text).toContain(STOP_LINE);
    expect(text).not.toMatch(FORBIDDEN);
  });

  it('a typical message keeps every line: real token, long slug, two-word city', () => {
    const real = {
      ...site,
      name: 'Стоматологическая клиника «Улыбка»',
      city: 'Набережные Челны',
      slug: 'stomatologicheskaya-klinika-ulybka-naberezhnye-chelny-a1b2',
    };
    const text = buildWhatsAppText(real, {
      ...input,
      previewUrl: `${BASE}/preview/${'0123456789abcdef'.repeat(2)}`,
    });
    expect(text.length).toBeLessThanOrEqual(WHATSAPP_MAX_LENGTH);
    expect(text).toContain(`utm_campaign=${real.slug}`);
    expect(text).toContain(LEADS_TO_EMAIL_LINE);
    expect(text).toContain(`Ответьте здесь или позвоните ${SITE.phone}.`);
    expect(text.trim().endsWith('из открытой карточки компании.')).toBe(true);
  });

  it('without an e-mail in the card it asks for the address to send the leads to', () => {
    const text = buildWhatsAppText({ ...site, email: null }, input);
    expect(text).toContain(`${LEADS_TO_EMAIL_LINE} — пришлите адрес в ответ.`);
    expect(text.length).toBeLessThanOrEqual(WHATSAPP_MAX_LENGTH);
    expect(buildWhatsAppText({ ...site, email: '  ' }, input)).toContain('пришлите адрес');
  });

  it('provider text: promise, how to go online, no prices', () => {
    const text = buildWhatsAppText(provider, input);
    expect(text.length).toBeLessThanOrEqual(WHATSAPP_MAX_LENGTH);
    expect(text).toContain(PLATFORM_PROMISE);
    expect(text).toContain('«Это моя компания»');
    expect(text).toContain(input.previewUrl);
    expect(text).not.toContain('₽');
    expect(text).toContain(STOP_LINE);
    expect(text).not.toContain('sajt-pod-klyuch');
    expect(text).not.toContain(LEADS_TO_EMAIL_LINE);
  });

  it('keeps the limit, the link and the stop line for a very long company name', () => {
    const long = { ...site, name: 'Общество с ограниченной ответственностью '.repeat(6) };
    const text = buildWhatsAppText(long, input);
    expect(text.length).toBeLessThanOrEqual(WHATSAPP_MAX_LENGTH);
    expect(text).toContain(input.previewUrl);
    expect(text).toContain(STOP_LINE);
  });

  it('drops the optional lines first, never the preview link or the stop line (last)', () => {
    for (const repeat of [1, 2, 3, 4, 5, 6]) {
      const name = 'Стоматологическая клиника '.repeat(repeat);
      const text = buildWhatsAppText({ ...site, name }, input);
      expect(text.length, `repeat ${repeat}`).toBeLessThanOrEqual(WHATSAPP_MAX_LENGTH);
      expect(text).toContain(input.previewUrl);
      const parts = text.split('\n\n');
      expect(parts[parts.length - 1]!.startsWith(STOP_LINE), `repeat ${repeat}`).toBe(true);
    }
  });
});

describe('pickChannels / whatsappTarget', () => {
  const base: OutreachContact = {
    email: 'info@example.com',
    whatsapp: null,
    phone: '+79270000000',
    emailSentAt: null,
    whatsappSentAt: null,
    status: 'READY',
  };
  const all = { whatsappToPhone: false, channels: { email: true, whatsapp: true } };

  it('email when there is an address, the channel is configured and nothing was sent', () => {
    expect(pickChannels(base, all)).toEqual(['email']);
    expect(pickChannels({ ...base, email: null }, all)).toEqual([]);
    expect(pickChannels({ ...base, email: '  ' }, all)).toEqual([]);
    expect(pickChannels({ ...base, emailSentAt: new Date() }, all)).toEqual([]);
    expect(pickChannels(base, { ...all, channels: { email: false, whatsapp: true } })).toEqual([]);
  });

  it('whatsapp only to the number the company gave as WhatsApp…', () => {
    const p = { ...base, whatsapp: '+79271112233' };
    expect(pickChannels(p, all)).toEqual(['email', 'whatsapp']);
    expect(whatsappTarget(p, all)).toBe('79271112233');
    expect(pickChannels({ ...p, whatsappSentAt: new Date() }, all)).toEqual(['email']);
    expect(pickChannels(p, { ...all, channels: { email: true, whatsapp: false } })).toEqual([
      'email',
    ]);
  });

  it('…or to a mobile phone from the card when the owner allowed it', () => {
    expect(pickChannels(base, { ...all, whatsappToPhone: true })).toEqual(['email', 'whatsapp']);
    expect(whatsappTarget(base, { whatsappToPhone: true })).toBe('79270000000');
    expect(whatsappTarget(base, { whatsappToPhone: false })).toBeNull();
    // A landline is never a WhatsApp target, even with the setting on.
    const landline = { ...base, phone: '+78432001122' };
    expect(pickChannels(landline, { ...all, whatsappToPhone: true })).toEqual(['email']);
    expect(whatsappTarget(landline, { whatsappToPhone: true })).toBeNull();
  });

  it('only READY and CONTACTED prospects are written to', () => {
    for (const status of ['NEW', 'CALLBACK', 'AGREED', 'PUBLISHED', 'DECLINED', 'REGISTERED']) {
      expect(pickChannels({ ...base, status }, all)).toEqual([]);
    }
    expect(pickChannels({ ...base, status: 'CONTACTED' }, all)).toEqual(['email']);
  });

  it('isRuMobile accepts +79…, 8 9…, 9… and rejects landlines', () => {
    expect(isRuMobile('+7 927 000-00-00')).toBe(true);
    expect(isRuMobile('89270000000')).toBe(true);
    expect(isRuMobile('9270000000')).toBe(true);
    expect(isRuMobile('+78432001122')).toBe(false);
    expect(isRuMobile(null)).toBe(false);
  });
});

describe('isStopReply', () => {
  it('recognises stop words in Russian forms and in Latin', () => {
    for (const text of [
      'стоп',
      'Стоп!',
      'СТОП, не надо',
      'stop',
      'Stop please',
      'не пишите мне',
      'Не пишите больше',
      'не пиши сюда',
      'отпишите нас',
      'Отпишитесь от нас, пожалуйста',
      'удалите мой номер',
      'прошу удалить нас из базы',
    ]) {
      expect(isStopReply(text), text).toBe(true);
    }
  });

  it('does not fire on ordinary replies or on words that merely contain the stem', () => {
    for (const text of [
      'Интересно, расскажите подробнее',
      'Сколько стоит поддержка?',
      'Да, давайте',
      'стопор сломался, нужен экскаватор',
      'автостоп',
      'nonstop',
      'Перезвоните завтра',
    ]) {
      expect(isStopReply(text), text).toBe(false);
    }
  });
});

describe('personal offer in the site letter and WhatsApp (U2)', () => {
  const offer = {
    subject: 'Вы работаете до 21:00 — пусть клиенты видят это сразу',
    opener: 'Вы работаете до 21:00 — это сильная сторона.',
    bullets: ['Первый пункт про услуги.', 'Второй пункт про часы.', 'Третий пункт про заявки.'],
    packageKey: 'domen' as const,
    packageReason: 'рядом несколько конкурентов со своими сайтами',
  };
  const withOffer: OutreachInput = { ...input, offer };

  it('letter: subject, opener, bullets, recommended package with its price, links, stop last', () => {
    const letter = buildEmail(site, withOffer);
    expect(letter.subject).toBe(offer.subject);
    expect(letter.text).toContain(offer.opener);
    for (const b of offer.bullets) expect(letter.text).toContain(`• ${b}`);
    expect(letter.text).toContain('«Сайт на своём домене» — 17 000 ₽ один раз');
    expect(letter.text).toContain('1 500 ₽ в месяц');
    expect(letter.text).toContain(offer.packageReason);
    expect(letter.text).toContain('После подключения добавим форму заявки: заявки с сайта');
    expect(letter.text).toContain(input.previewUrl);
    expect(letter.text).toContain(`${SERVICE_LINK_LABEL}: ${SERVICE_EMAIL}`);
    stopLineIsLast(letter.text);
    expect(letter.html).toContain('<ul');
    expect(letter.html).toContain(`<li style="margin:0 0 6px">${offer.bullets[0]}</li>`);
    expect(letter.text).not.toMatch(FORBIDDEN);
  });

  it('the starter package and its base price for «vizitka»', () => {
    const letter = buildEmail(site, { ...input, offer: { ...offer, packageKey: 'vizitka' } });
    expect(letter.text).toContain('«Сайт-визитка» — 15 000 ₽ один раз');
  });

  it('html escapes the offer text', () => {
    const letter = buildEmail(site, {
      ...input,
      offer: { ...offer, bullets: ['<b>жирно</b>', 'два', 'три'] },
    });
    expect(letter.html).toContain('&lt;b&gt;жирно&lt;/b&gt;');
    expect(letter.html).not.toContain('<b>жирно');
  });

  it('a provider ignores the offer', () => {
    const letter = buildEmail(provider, withOffer);
    expect(letter.subject).toBe(`Ваша страница на ${SITE.platform} уже готова`);
    expect(buildWhatsAppText(provider, withOffer)).not.toContain(offer.opener);
  });

  it('WhatsApp: opener, link, bullets, price, stop line last, within the limit', () => {
    const text = buildWhatsAppText(site, withOffer);
    expect(text.length).toBeLessThanOrEqual(WHATSAPP_MAX_LENGTH);
    expect(text).toContain(offer.opener);
    expect(text).toContain(input.previewUrl);
    expect(text).toContain(`• ${offer.bullets[1]}`);
    expect(text).toContain('17 000 ₽');
    expect(text).toContain(`${SERVICE_LINK_LABEL}: ${SERVICE_WHATSAPP}`);
    expect(text.trim().endsWith('из открытой карточки компании.')).toBe(true);
  });

  it('WhatsApp: long bullets go before the link, the price or the stop line', () => {
    const long = { ...offer, bullets: [1, 2, 3].map((i) => `Пункт ${i} `.repeat(30)) };
    const text = buildWhatsAppText(site, { ...input, offer: long });
    expect(text.length).toBeLessThanOrEqual(WHATSAPP_MAX_LENGTH);
    expect(text).not.toContain('Пункт 1');
    expect(text).toContain(input.previewUrl);
    expect(text).toContain('17 000 ₽');
    const parts = text.split('\n\n');
    expect(parts[parts.length - 1]!.startsWith(STOP_LINE)).toBe(true);
  });
});

describe('ссылка «Больше не писать» (К3)', () => {
  const url = `${BASE}/otpiska/tok?s=sig`;

  it('есть в первом письме и в напоминании — текстом и ссылкой', () => {
    for (const letter of [
      buildEmail(site, { ...input, unsubscribeUrl: url }),
      buildFollowUpEmail(site, { ...input, unsubscribeUrl: url }),
      buildEmail(provider, { ...input, unsubscribeUrl: url }),
    ]) {
      expect(letter.text.trim().split('\n').at(-1)).toBe(`${UNSUBSCRIBE_LABEL}: ${url}`);
      expect(letter.html).toContain(`<a href="${url}">`);
      expect(letter.html).toContain(UNSUBSCRIBE_LABEL);
    }
  });

  it('без ссылки строки нет', () => {
    expect(buildEmail(site, input).text).not.toContain(UNSUBSCRIBE_LABEL);
  });
});
