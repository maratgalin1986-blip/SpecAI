import { describe, expect, it } from 'vitest';
import { PLATFORM_PROMISE } from '@specai/shared';
import { SITE } from '@/lib/site';
import {
  buildEmail,
  buildWhatsAppText,
  isRuMobile,
  isStopReply,
  pickChannels,
  STOP_LINE,
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

const input: OutreachInput = {
  previewUrl: 'https://xn--24-6kc5aagh4arjl.xn--p1ai/preview/tok123',
  prices: { setup: 15000, monthly: 1500 },
  nicheTitle: 'Стоматология',
  replyTo: 'office@example.com',
};

const FORBIDDEN = /лучш|гарантир|самые|самый|самая/i;

describe('buildEmail', () => {
  it('site letter: subject, who we are, link, prices, stop line last', () => {
    const letter = buildEmail(site, input);
    expect(letter.subject).toBe('Сделали страницу для «Стоматология «Улыбка»» — посмотрите');
    expect(letter.text).toContain(SITE.name);
    expect(letter.text).toContain(SITE.platform);
    expect(letter.text).toContain('в городе Казань');
    expect(letter.text).toContain('стоматология');
    expect(letter.text).toContain(input.previewUrl);
    expect(letter.text).toContain('15 000 ₽');
    expect(letter.text).toContain('1 500 ₽');
    expect(letter.text).toContain(`позвоните ${SITE.phone}`);
    expect(letter.text).toContain(
      `${STOP_LINE} Письмо отправлено один раз на адрес из открытой карточки компании.`,
    );
    // The stop line is the last thing the reader sees before the signature.
    const lines = letter.text.trim().split('\n').filter(Boolean);
    expect(lines[lines.length - 2]).toContain(STOP_LINE);
    expect(letter.text).not.toMatch(FORBIDDEN);
    expect(letter.html).not.toMatch(FORBIDDEN);
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

describe('buildWhatsAppText', () => {
  it('is short, has the link, the prices (site) and the stop line', () => {
    const text = buildWhatsAppText(site, input);
    expect(text.length).toBeLessThanOrEqual(WHATSAPP_MAX_LENGTH);
    expect(text).toContain(SITE.name);
    expect(text).toContain(input.previewUrl);
    expect(text).toContain('15 000 ₽');
    expect(
      text.trim().endsWith('Сообщение отправлено один раз на номер из открытой карточки компании.'),
    ).toBe(true);
    expect(text).toContain(STOP_LINE);
    expect(text).not.toMatch(FORBIDDEN);
  });

  it('provider text: promise, how to go online, no prices', () => {
    const text = buildWhatsAppText(provider, input);
    expect(text.length).toBeLessThanOrEqual(WHATSAPP_MAX_LENGTH);
    expect(text).toContain(PLATFORM_PROMISE);
    expect(text).toContain('«Это моя компания»');
    expect(text).toContain(input.previewUrl);
    expect(text).not.toContain('₽');
    expect(text).toContain(STOP_LINE);
  });

  it('keeps the limit, the link and the stop line for a very long company name', () => {
    const long = { ...site, name: 'Общество с ограниченной ответственностью '.repeat(6) };
    const text = buildWhatsAppText(long, input);
    expect(text.length).toBeLessThanOrEqual(WHATSAPP_MAX_LENGTH);
    expect(text).toContain(input.previewUrl);
    expect(text).toContain(STOP_LINE);
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
