import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SMTP_HOST,
  officeMailConfig,
  officeMailConfigured,
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
