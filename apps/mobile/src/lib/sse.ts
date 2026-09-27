import { API_URL, authHeaders } from './api';

export interface ChatStreamEvent {
  delta?: string;
  done?: boolean;
  conversationId?: string;
  error?: string;
}

export interface ChatStreamHandlers {
  onEvent: (event: ChatStreamEvent) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

/**
 * Стриминг ответа ассистента по SSE. У fetch в React Native нет ReadableStream,
 * поэтому читаем responseText по мере прихода через XMLHttpRequest.onprogress
 * и разбираем строки `data: {...}` по мере появления.
 *
 * Возвращает функцию отмены.
 */
export function streamChat(
  body: { message: string; conversationId?: string },
  handlers: ChatStreamHandlers,
): () => void {
  const xhr = new XMLHttpRequest();
  let offset = 0;
  let buffer = '';
  let closed = false;

  const finish = () => {
    if (closed) return;
    closed = true;
    handlers.onClose();
  };

  const consume = () => {
    const text = xhr.responseText ?? '';
    if (text.length <= offset) return;
    buffer += text.slice(offset);
    offset = text.length;

    let separator = buffer.indexOf('\n\n');
    while (separator !== -1) {
      const chunk = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          handlers.onEvent(JSON.parse(payload) as ChatStreamEvent);
        } catch {
          // повреждённый чанк пропускаем
        }
      }
      separator = buffer.indexOf('\n\n');
    }
  };

  xhr.open('POST', `${API_URL}/api/ai/chat`);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Accept', 'text/event-stream');

  xhr.onprogress = consume;
  xhr.onreadystatechange = () => {
    if (xhr.readyState !== XMLHttpRequest.DONE) return;
    if (xhr.status >= 200 && xhr.status < 300) {
      consume();
      finish();
      return;
    }
    let message = `Ошибка сервера (${xhr.status || 'сеть'})`;
    try {
      const parsed = JSON.parse(xhr.responseText) as { error?: unknown };
      if (typeof parsed.error === 'string') message = parsed.error;
    } catch {
      // тело не JSON
    }
    if (xhr.status === 0) message = 'Нет соединения с сервером';
    handlers.onError(message);
    finish();
  };
  xhr.onerror = () => {
    handlers.onError('Нет соединения с сервером');
    finish();
  };

  void authHeaders().then((headers) => {
    if (closed) return;
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.send(JSON.stringify(body));
  });

  return () => {
    if (closed) return;
    closed = true;
    xhr.abort();
  };
}
