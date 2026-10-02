import { describe, expect, it } from 'vitest';
import {
  COMMENT_MAX_LENGTH,
  commentTargetError,
  prepareCommentText,
  shortAuthorName,
  toPublicComment,
} from './comments';
import { HIDDEN_CONTACT, HIDDEN_LINK } from './privacy';

describe('prepareCommentText', () => {
  it('accepts 10 to 1000 characters after trimming', () => {
    expect(prepareCommentText('  коротко  ')).toMatchObject({ ok: false });
    expect(prepareCommentText('Всё хорошо')).toEqual({ ok: true, text: 'Всё хорошо' });
    expect(prepareCommentText('а'.repeat(COMMENT_MAX_LENGTH))).toMatchObject({ ok: true });
    const tooLong = prepareCommentText('а'.repeat(COMMENT_MAX_LENGTH + 1));
    expect(tooLong).toMatchObject({ ok: false });
    if (!tooLong.ok) expect(tooLong.error).toContain('1000');
    expect(prepareCommentText(42)).toMatchObject({ ok: false });
  });

  it('hides phones, e-mails and links', () => {
    const result = prepareCommentText(
      'Звоните 8 917 000-11-22 или пишите ivan@mail.ru, сайт https://kran16.ru и www.spam.com, t.me/kran',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).not.toMatch(/917|ivan|kran16|spam|t\.me/);
    expect(result.text).toContain(HIDDEN_CONTACT);
    expect(result.text).toContain(HIDDEN_LINK);
  });

  it('hides bare domains but keeps ordinary text and dates', () => {
    const result = prepareCommentText('Подробнее на kran-kazan.ru/price, работали 01.06.2026');
    expect(result).toEqual({
      ok: true,
      text: `Подробнее на ${HIDDEN_LINK}, работали 01.06.2026`,
    });
  });
});

describe('shortAuthorName', () => {
  it('keeps the first name and the initial of the surname', () => {
    expect(shortAuthorName('Иван Петров')).toBe('Иван П.');
    expect(shortAuthorName('мария')).toBe('Мария');
    expect(shortAuthorName('  Пётр   Сидоров  Иванович ')).toBe('Пётр С.');
  });

  it('never shows an e-mail or a phone', () => {
    expect(shortAuthorName('ivan@mail.ru')).toBe('Пользователь');
    expect(shortAuthorName('+7 917 000 11 22')).toBe('Пользователь');
    expect(shortAuthorName('')).toBe('Пользователь');
    expect(shortAuthorName(null)).toBe('Пользователь');
  });
});

describe('commentTargetError', () => {
  const customer = { id: 'u1', role: 'CUSTOMER', companyId: null };
  const provider = { id: 'p1', role: 'PROVIDER_ADMIN', companyId: 'c1' };

  it('requires a signed-in author', () => {
    expect(commentTargetError(null, { targetCompanyId: 'c1' })).toContain('Войдите');
  });

  it('requires exactly one target', () => {
    expect(commentTargetError(customer, {})).not.toBeNull();
    expect(
      commentTargetError(customer, { targetCompanyId: 'c1', targetUserId: 'u2' }),
    ).not.toBeNull();
  });

  it('a customer may write about a provider company', () => {
    expect(commentTargetError(customer, { targetCompanyId: 'c1' })).toBeNull();
  });

  it('a provider may not praise its own company', () => {
    expect(commentTargetError(provider, { targetCompanyId: 'c1' })).toContain('своей');
    expect(commentTargetError(provider, { targetCompanyId: 'c2' })).toBeNull();
  });

  it('only providers write about customers, and not about themselves', () => {
    expect(commentTargetError(provider, { targetUserId: 'u1' })).toBeNull();
    expect(commentTargetError(customer, { targetUserId: 'u3' })).toContain('исполнители');
    expect(commentTargetError(provider, { targetUserId: 'p1' })).toContain('себе');
  });
});

describe('toPublicComment', () => {
  it('shows no e-mail, a short name and the provider company', () => {
    const comment = toPublicComment({
      id: 'x',
      text: 'Отлично, пишите petrov@mail.ru',
      createdAt: new Date('2026-10-01T10:00:00Z'),
      author: { name: 'Иван Петров', role: 'PROVIDER_ADMIN', company: { name: 'СпецПласт16' } },
    });
    expect(comment).toEqual({
      id: 'x',
      text: `Отлично, пишите ${HIDDEN_CONTACT}`,
      createdAt: '2026-10-01T10:00:00.000Z',
      authorName: 'Иван П.',
      authorCompany: 'СпецПласт16',
    });
    expect(JSON.stringify(comment)).not.toContain('@');
    expect(
      toPublicComment({
        id: 'y',
        text: 'Хорошая работа',
        createdAt: new Date(),
        author: { name: 'Анна', role: 'CUSTOMER', company: { name: 'ООО Ромашка' } },
      }).authorCompany,
    ).toBeNull();
  });
});
