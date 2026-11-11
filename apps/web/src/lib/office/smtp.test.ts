import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SMTP_HOST,
  officeMailConfig,
  officeMailConfigured,
  officeMailHint,
  OFFICE_TEST_SUBJECT,
  sendOfficeMail,
  sendOfficeTestMail,
  type OfficeMailTransport,
} from './smtp';

const ENV = { OUTREACH_SMTP_USER: 'office@example.ru', OUTREACH_SMTP_PASS: 'secret' };
const MAIL = { to: 'firm@example.ru', subject: 'Тема', html: '<p>Текст</p>', text: 'Текст' };

describe('officeMailConfig', () => {
  it('без пользователя или пароля ящика нет', () => {
    expect(officeMailConfig({})).toBeNull();
    expect(officeMailConfig({ OUTREACH_SMTP_USER: 'a@b.ru' })).toBeNull();
    expect(officeMailConfigured({ OUTREACH_SMTP_PASS: 'x' })).toBe(false);
  });

  it('по умолчанию — Яндекс, порт 465 с TLS, отправитель — пользователь', () => {
    expect(officeMailConfig(ENV)).toEqual({
      host: DEFAULT_SMTP_HOST,
      port: 465,
      secure: true,
      user: 'office@example.ru',
      pass: 'secret',
      from: 'office@example.ru',
    });
    expect(officeMailConfigured(ENV)).toBe(true);
  });

  it('свой сервер, порт и отправитель', () => {
    const config = officeMailConfig({
      ...ENV,
      OUTREACH_SMTP_HOST: 'smtp.mail.ru',
      OUTREACH_SMTP_PORT: '587',
      OUTREACH_FROM: 'ИИСтройка24 <office@example.ru>',
    });
    expect(config).toMatchObject({
      host: 'smtp.mail.ru',
      port: 587,
      secure: false,
      from: 'ИИСтройка24 <office@example.ru>',
    });
    expect(officeMailConfig({ ...ENV, OUTREACH_SMTP_PORT: 'abc' })?.port).toBe(465);
  });
});

describe('пароль и сервер по логину', () => {
  it('пробелы и перевод строки в пароле убираются: так его вставляют в Vercel', () => {
    const env = { ...ENV, OUTREACH_SMTP_PASS: ' abcd efgh ijkl mnop\n' };
    expect(officeMailConfig(env)?.pass).toBe('abcdefghijklmnop');
    expect(officeMailConfig({ ...ENV, OUTREACH_SMTP_PASS: ' \n ' })).toBeNull();
  });

  it('сервер берётся по домену логина, явный сервер важнее', () => {
    const host = (user: string, extra: Record<string, string> = {}) =>
      officeMailConfig({ ...ENV, OUTREACH_SMTP_USER: user, ...extra })?.host;
    expect(host('firm@yandex.ru')).toBe('smtp.yandex.ru');
    expect(host('firm@Mail.ru')).toBe('smtp.mail.ru');
    expect(host('firm@bk.ru')).toBe('smtp.mail.ru');
    expect(host('firm@gmail.com')).toBe('smtp.gmail.com');
    expect(host('office@firma.example')).toBe(DEFAULT_SMTP_HOST);
    expect(host('firm@mail.ru', { OUTREACH_SMTP_HOST: 'smtp.own.example' })).toBe(
      'smtp.own.example',
    );
  });
});

describe('отправитель и кавычки', () => {
  it('адрес отправителя — всегда логин, имя берётся из OUTREACH_FROM', () => {
    const from = (value: string) => officeMailConfig({ ...ENV, OUTREACH_FROM: value })?.from;
    expect(from('ИИСтройка24 <other@mail.ru>')).toBe('ИИСтройка24 <office@example.ru>');
    expect(from('«ИИСтройка24 <office@example.ru>»')).toBe('ИИСтройка24 <office@example.ru>');
    expect(from('ИИСтройка24')).toBe('ИИСтройка24 <office@example.ru>');
    expect(from('other@mail.ru')).toBe('office@example.ru');
  });

  it('кавычки и невидимые знаки вокруг логина и пароля убираются', () => {
    const config = officeMailConfig({
      OUTREACH_SMTP_USER: '"office@example.ru"',
      OUTREACH_SMTP_PASS: '\u200b«abcdefghijklmnop»',
    });
    expect(config).toMatchObject({ user: 'office@example.ru', pass: 'abcdefghijklmnop' });
  });
});

describe('officeMailHint', () => {
  it('без ящика — no-smtp', () => {
    expect(officeMailHint({})).toBe('no-smtp');
  });

  it('признаки без значений: сервер, домен логина, отправитель, вид пароля', () => {
    const hint = officeMailHint({
      OUTREACH_SMTP_USER: 'Firma@Yandex.ru',
      OUTREACH_SMTP_PASS: 'abcdefghijklmnop',
      OUTREACH_FROM: 'ИИСтройка24 <firma@yandex.ru>',
    });
    expect(hint).toBe('host=smtp.yandex.ru login=@yandex.ru from=login pass=app-password');
    expect(hint).not.toContain('Firma');
    expect(hint).not.toContain('abcdefgh');
  });

  it('логин без домена, чужой адрес отправителя, пароль не как у приложения, пробелы', () => {
    expect(
      officeMailHint({
        OUTREACH_SMTP_USER: 'firma',
        OUTREACH_SMTP_PASS: 'Qwerty 12345',
        OUTREACH_FROM: 'other@mail.ru',
      }),
    ).toBe(
      'host=smtp.yandex.ru login=not-an-address from=replaced-by-login pass=other pass-had-spaces',
    );
  });
});

describe('sendOfficeMail', () => {
  it('без SMTP — no-smtp, транспорт не создаётся', async () => {
    const transport = vi.fn();
    expect(await sendOfficeMail(MAIL, { env: {}, transport })).toEqual({
      ok: false,
      reason: 'no-smtp',
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it('отправляет через SMTP с Reply-To и заголовками', async () => {
    const sendMail = vi.fn<OfficeMailTransport['sendMail']>(async () => ({}));
    const result = await sendOfficeMail(
      { ...MAIL, replyTo: 'owner@example.ru', headers: { 'List-Unsubscribe': '<https://x/y>' } },
      { env: ENV, transport: () => ({ sendMail }) },
    );
    expect(result).toEqual({ ok: true });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'office@example.ru',
      to: 'firm@example.ru',
      subject: 'Тема',
      html: '<p>Текст</p>',
      text: 'Текст',
      replyTo: 'owner@example.ru',
      headers: { 'List-Unsubscribe': '<https://x/y>' },
    });
  });

  it('переводы строк из адреса и темы убираются', async () => {
    const sendMail = vi.fn<OfficeMailTransport['sendMail']>(async () => ({}));
    await sendOfficeMail(
      { ...MAIL, to: 'firm@example.ru\r\nBcc: x@y.ru', subject: 'А\nБ' },
      { env: ENV, transport: () => ({ sendMail }) },
    );
    const sent = sendMail.mock.calls[0]![0];
    expect(sent.to).not.toMatch(/[\r\n]/);
    expect(sent.subject).toBe('А Б');
  });

  it('ошибка сервера — текстом, без исключения', async () => {
    const result = await sendOfficeMail(MAIL, {
      env: ENV,
      transport: () => ({
        sendMail: async () => {
          throw new Error('535 Authentication failed');
        },
      }),
    });
    expect(result).toEqual({ ok: false, reason: '535 Authentication failed' });
  });

  it('технический адрес .invalid не получает писем', async () => {
    const sendMail = vi.fn();
    const result = await sendOfficeMail(
      { ...MAIL, to: 'bot@chat.invalid' },
      { env: ENV, transport: () => ({ sendMail }) },
    );
    expect(result.ok).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('sendOfficeTestMail', () => {
  it('шлёт одно письмо с ящика на него же', async () => {
    const sendMail = vi.fn<OfficeMailTransport['sendMail']>(async () => ({}));
    const result = await sendOfficeTestMail({
      env: { ...ENV, OUTREACH_FROM: 'ИИСтройка24 <office@example.ru>' },
      transport: () => ({ sendMail }),
    });
    expect(result).toEqual({ ok: true });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const sent = sendMail.mock.calls[0]![0];
    expect(sent.to).toBe('office@example.ru');
    expect(sent.from).toBe('ИИСтройка24 <office@example.ru>');
    expect(sent.subject).toBe(OFFICE_TEST_SUBJECT);
    expect(sent.text).toContain('Ящик офиса работает');
  });

  it('без SMTP — no-smtp, транспорт не создаётся', async () => {
    const transport = vi.fn();
    expect(await sendOfficeTestMail({ env: {}, transport })).toEqual({
      ok: false,
      reason: 'no-smtp',
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it('ошибка сервера возвращается причиной', async () => {
    const result = await sendOfficeTestMail({
      env: ENV,
      transport: () => ({
        sendMail: async () => {
          throw new Error('Invalid login: 535 5.7.8');
        },
      }),
    });
    expect(result).toEqual({ ok: false, reason: 'Invalid login: 535 5.7.8' });
  });
});
