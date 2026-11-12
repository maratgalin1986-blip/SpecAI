/**
 * «Забыли пароль?» на экране входа: что показать после
 * POST /api/auth/forgot-password. Сервер отвечает одинаково для любого
 * адреса (не раскрывает, есть ли аккаунт); пока почта площадки не
 * подключена — 503 с понятным текстом, и показываем именно его, а не
 * «мы отправили письмо».
 */
export const RESET_SENT_MESSAGE =
  'Если такой e-mail зарегистрирован, мы отправили на него ссылку для сброса пароля. ' +
  'Проверьте почту и папку «Спам».';

/**
 * Запасной текст для 503 без текста от сервера. Без номера: модуль чистый
 * (тесты), а кнопка «Позвонить» есть на экране входа.
 */
export const RESET_OFF_MESSAGE =
  'Письма сейчас не отправляются, поэтому ссылку для сброса пароля прислать не можем. ' +
  'Позвоните диспетчеру — кнопка «Позвонить» ниже.';

export interface ResetNotice {
  ok: boolean;
  text: string;
}

/** Ошибка запроса → сообщение под формой; текст сервера — как есть. */
export function resetFailure(error: unknown): ResetNotice {
  const status =
    error && typeof error === 'object' && 'status' in error
      ? Number((error as { status: unknown }).status)
      : null;
  const message =
    error instanceof Error && error.message.trim().length > 0 ? error.message.trim() : null;
  if (status === 503) {
    // «Ошибка сервера (503)» — запасной текст клиента, а не слова сервера.
    const fromServer = message !== null && !message.startsWith('Ошибка сервера');
    return { ok: false, text: fromServer ? message : RESET_OFF_MESSAGE };
  }
  if (status !== null && Number.isFinite(status) && message) return { ok: false, text: message };
  return { ok: false, text: 'Не удалось отправить письмо. Попробуйте ещё раз.' };
}
