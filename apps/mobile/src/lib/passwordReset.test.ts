import { describe, expect, it } from 'vitest';
import { RESET_OFF_MESSAGE, resetFailure } from './passwordReset';

/** As lib/api.ts ApiError, without importing the API client. */
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

describe('«Забыли пароль?» answers', () => {
  it('503 (letters are off): the server’s own words', () => {
    const text = 'Письма сейчас не отправляются. Позвоните диспетчеру: +7 (927) 242-80-88';
    expect(resetFailure(new ApiError(503, text))).toEqual({ ok: false, text });
  });

  it('503 without a body: our own explanation, not «Ошибка сервера (503)»', () => {
    expect(resetFailure(new ApiError(503, 'Ошибка сервера (503)')).text).toBe(RESET_OFF_MESSAGE);
    expect(RESET_OFF_MESSAGE).toContain('Позвоните');
  });

  it('other answers keep the server’s message; anything else is a plain retry line', () => {
    expect(resetFailure(new ApiError(400, 'Укажите корректный e-mail')).text).toBe(
      'Укажите корректный e-mail',
    );
    expect(resetFailure(new ApiError(0, 'Нет соединения с сервером')).text).toBe(
      'Нет соединения с сервером',
    );
    expect(resetFailure(new Error('boom')).text).toBe(
      'Не удалось отправить письмо. Попробуйте ещё раз.',
    );
    expect(resetFailure(null).ok).toBe(false);
  });
});
