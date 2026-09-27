'use client';

import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** True while the assistant reply is still streaming. */
  pending?: boolean;
}

const STORAGE_KEY = 'specai:chat:conversationId';

function readStoredConversationId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeConversationId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage may be unavailable (private mode); the chat still works for this session.
  }
}

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `m${Date.now()}-${idCounter}`;
}

export function ChatWidget() {
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Pick up the saved conversation id once we're on the client.
  useEffect(() => {
    setConversationId(readStoredConversationId());
  }, []);

  // Restore history the first time the panel is opened.
  useEffect(() => {
    if (!isOpen || historyLoaded) return;
    if (!conversationId) {
      setHistoryLoaded(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/ai/chat?conversationId=${encodeURIComponent(conversationId)}`,
        );
        if (res.status === 404) {
          // Conversation belongs to another account or was removed — start fresh.
          storeConversationId(null);
          if (!cancelled) setConversationId(null);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages: { id: string; role: 'USER' | 'ASSISTANT'; content: string }[];
        };
        if (cancelled) return;
        setMessages(
          data.messages.map((m) => ({
            id: m.id,
            role: m.role === 'USER' ? 'user' : 'assistant',
            content: m.content,
          })),
        );
      } catch {
        // Ignore: history is a convenience, the chat still works without it.
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, historyLoaded, conversationId]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const updateAssistant = useCallback((id: string, updater: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? updater(m) : m)));
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;

      setError(null);
      setIsSending(true);
      setInput('');

      const assistantId = nextId();
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'user', content: trimmed },
        { id: assistantId, role: 'assistant', content: '', pending: true },
      ]);

      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: conversationId ?? undefined, message: trimmed }),
        });

        if (!res.ok || !res.body) {
          let message = 'Не удалось отправить сообщение';
          if (res.status === 429) message = 'Слишком много сообщений, подождите минуту';
          else if (res.status === 401) message = 'Войдите в аккаунт, чтобы пользоваться чатом';
          else if (res.status === 404) {
            // Stale conversation id: forget it so the next message starts a new dialogue.
            storeConversationId(null);
            setConversationId(null);
            message = 'Диалог не найден, начните новый';
          }
          throw new Error(message);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const handleEvent = (raw: string) => {
          const line = raw
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trim())
            .join('');
          if (!line) return;
          let payload: { delta?: string; done?: boolean; conversationId?: string; error?: string };
          try {
            payload = JSON.parse(line);
          } catch {
            return;
          }
          if (payload.delta) {
            updateAssistant(assistantId, (m) => ({ ...m, content: m.content + payload.delta }));
          }
          if (payload.conversationId) {
            storeConversationId(payload.conversationId);
            setConversationId(payload.conversationId);
          }
          if (payload.error) {
            setError(payload.error);
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary = buffer.indexOf('\n\n');
          while (boundary !== -1) {
            handleEvent(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf('\n\n');
          }
        }
        if (buffer.trim()) handleEvent(buffer);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Что-то пошло не так');
      } finally {
        updateAssistant(assistantId, (m) => ({ ...m, pending: false }));
        setMessages((prev) =>
          prev.filter((m) => !(m.id === assistantId && m.content.trim().length === 0)),
        );
        setIsSending(false);
      }
    },
    [conversationId, isSending, updateAssistant],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(input);
  };

  const startNewConversation = () => {
    storeConversationId(null);
    setConversationId(null);
    setMessages([]);
    setError(null);
    setHistoryLoaded(true);
  };

  if (status !== 'authenticated' || !session) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <section
          role="dialog"
          aria-label="Чат с ассистентом SpecAI"
          className="flex h-[70vh] max-h-[600px] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <header className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">Ассистент SpecAI</p>
              <p className="text-xs text-slate-300">Подбор техники и ваши бронирования</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={startNewConversation}
                title="Новый диалог"
                className="rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                Новый
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Закрыть чат"
                className="rounded-md px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                ✕
              </button>
            </div>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-3">
            {!historyLoaded && (
              <p className="text-center text-xs text-slate-400">Загружаем историю…</p>
            )}
            {historyLoaded && messages.length === 0 && (
              <div className="rounded-lg bg-white p-3 text-sm text-slate-600 shadow-sm">
                Здравствуйте! Помогу подобрать спецтехнику под вашу задачу или расскажу о ваших
                бронированиях. Например: «Нужен экскаватор в Москве до 20 000 ₽ в сутки».
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                <div
                  className={
                    message.role === 'user'
                      ? 'max-w-[85%] whitespace-pre-wrap rounded-lg bg-slate-900 px-3 py-2 text-sm text-white'
                      : 'max-w-[85%] whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-sm text-slate-800 shadow-sm'
                  }
                >
                  {message.content}
                  {message.pending && (
                    <span className="ml-1 inline-block animate-pulse text-slate-400">▍</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="flex gap-2 border-t border-slate-200 p-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage(input);
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder="Напишите сообщение…"
              disabled={isSending}
              className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:bg-slate-100"
            />
            <button
              type="submit"
              disabled={isSending || input.trim().length === 0}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSending ? '…' : 'Отправить'}
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? 'Скрыть чат' : 'Открыть чат с ассистентом'}
        aria-expanded={isOpen}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition hover:bg-slate-700"
      >
        {isOpen ? (
          <span className="text-xl">▾</span>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 10h8M8 14h5m-9 6.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 3.5Z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
