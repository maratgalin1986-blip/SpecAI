import { describe, expect, it } from 'vitest';
import {
  addressesIn,
  buildReplyAnswer,
  classifyReply,
  isBounce,
  replyNotice,
  replyTop,
} from './replies';

const QUOTED = [
  'Добрый день! Сколько стоит такой сайт?',
  '',
  'ср, 11 нояб. 2026 г. в 18:04, ИИСтройка24 <box@yandex.ru>:',
  '> Здравствуйте! Пишет СпецПласт16.',
  '> Если не нужно — ответьте «стоп», больше не напишем.',
].join('\n');

describe('replyTop', () => {
  it('берёт только верх письма, без цитаты прошлого сообщения', () => {
    expect(replyTop(QUOTED)).toBe('Добрый день! Сколько стоит такой сайт?');
    expect(replyTop('Да, интересно\n\n-----Original Message-----\nстоп')).toBe('Да, интересно');
    expect(replyTop('Спасибо\nОтправлено с iPhone')).toBe('Спасибо');
  });
});

describe('classifyReply', () => {
  const kind = (text: string, subject = 'Re: страница') => classifyReply({ subject, text });

  it('слово «стоп» в цитате нашего письма отказом не считается', () => {
    expect(kind(QUOTED)).toBe('price');
  });

  it('отказ: «стоп», «не интересно», «у нас уже есть сайт»', () => {
    expect(kind('Стоп')).toBe('stop');
    expect(kind('Спасибо, не интересно')).toBe('stop');
    expect(kind('У нас уже есть сайт')).toBe('stop');
    expect(kind('Не пишите нам больше')).toBe('stop');
  });

  it('согласие, цена, интерес, прочее', () => {
    expect(kind('Согласны, выставляйте счёт')).toBe('agree');
    expect(kind('Какие условия и цена?')).toBe('price');
    expect(kind('Интересно, расскажите подробнее')).toBe('interest');
    expect(kind('Передал директору')).toBe('other');
    expect(kind('')).toBe('other');
  });

  it('автоответ — по заголовку или теме', () => {
    expect(classifyReply({ subject: 'Re: x', text: 'Я в отпуске', autoSubmitted: true })).toBe(
      'auto',
    );
    expect(kind('Вернусь 20-го', 'Автоответ: в отпуске')).toBe('auto');
  });
});

describe('отчёты о недоставке', () => {
  it('узнаёт почтового робота и вынимает адреса', () => {
    expect(isBounce({ from: 'mailer-daemon@yandex.ru', subject: 'x' })).toBe(true);
    expect(isBounce({ from: 'a@b.ru', subject: 'Undelivered Mail Returned to Sender' })).toBe(
      false,
    );
    expect(isBounce({ from: 'a@b.ru', subject: 'Re: страница' })).toBe(false);
    expect(addressesIn('Final-Recipient: rfc822; Firm@Mail.ru\n<firm@mail.ru>: 550')).toEqual([
      'firm@mail.ru',
    ]);
  });
});

describe('buildReplyAnswer', () => {
  const input = {
    name: 'Шиномонтаж',
    slug: 'shinomontazh',
    previewUrl: 'https://site.example/preview/tok',
    baseUrl: 'https://site.example',
    prices: { setup: 15000, monthly: 1500 },
    subject: 'страница для «Шиномонтаж»',
  };

  it('на вопрос о цене — цены пакетов, ссылка на страницу, просьба о реквизитах', () => {
    const answer = buildReplyAnswer('price', input)!;
    expect(answer.subject).toBe('Re: страница для «Шиномонтаж»');
    expect(answer.text).toContain('15 000 ₽');
    expect(answer.text).toContain('1 500 ₽ в месяц');
    expect(answer.text).toContain('https://site.example/preview/tok');
    expect(answer.text).toContain('реквизиты');
    expect(answer.html).toContain('href="https://site.example/preview/tok"');
    expect(answer.text).not.toMatch(/[\u00a0\u202f]/);
  });

  it('на согласие — подтверждение и реквизиты, без прайса; «Re:» не удваивается', () => {
    const answer = buildReplyAnswer('agree', { ...input, subject: 'RE: страница' })!;
    expect(answer.subject).toBe('RE: страница');
    expect(answer.text).toContain('счёт');
    expect(answer.text).not.toContain('15 000');
  });

  it('на «стоп», автоответ и непонятное письмо офис не отвечает', () => {
    expect(buildReplyAnswer('stop', input)).toBeNull();
    expect(buildReplyAnswer('auto', input)).toBeNull();
    expect(buildReplyAnswer('other', input)).toBeNull();
  });
});

describe('replyNotice', () => {
  it('говорит владельцу, что сделал офис и нужен ли он сам', () => {
    const base = {
      name: 'Шиномонтаж',
      city: 'Казань',
      text: 'Согласны',
      adminUrl: 'https://x/admin/office',
    };
    expect(replyNotice({ ...base, kind: 'agree', answered: true })).toContain('Ваш шаг');
    expect(replyNotice({ ...base, kind: 'price', answered: true })).toContain('Офис ответил сам');
    expect(replyNotice({ ...base, kind: 'other', answered: false })).toContain('ответьте сами');
    expect(replyNotice({ ...base, kind: 'stop', answered: false })).toContain(
      'Больше ему не пишем',
    );
  });
});
