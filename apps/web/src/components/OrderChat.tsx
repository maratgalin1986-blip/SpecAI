'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CHAT_MESSAGE_MAX_LENGTH, type PublicChatMessage } from '@/lib/orderChat';

/** How often an open chat asks for new messages. */
const POLL_MS = 10_000;

interface ThreadView {
  id: string;
  counterpart: string;
  canWrite: boolean;
  contactsOpen: boolean;
  notice: string | null;
}

async function readJson(response: Response | null) {
  return response ? await response.json().catch(() => null) : null;
}

function errorOf(body: unknown, fallback: string): string {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === 'string' ? error : fallback;
}

function timeOf(iso: string): string {
  const date = new Date(iso);
  const today = new Date().toDateString() === date.toDateString();
  return today
    ? date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
}

/**
 * Chat between the customer of an order and one provider company. The
 * customer mounts it per offer (`companyId`), a provider without it (the
 * server picks the company's own thread), an admin with `readOnly`. Opens
 * collapsed; while open it polls every 10 s and marks messages as read.
 */
export function OrderChat({
  orderId,
  companyId,
  label = 'Открыть чат',
  readOnly = false,
  defaultOpen = false,
}: {
  orderId: string;
  companyId?: string;
  label?: string;
  readOnly?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [thread, setThread] = useState<ThreadView | null>(null);
  const [messages, setMessages] = useState<PublicChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<string | null>(null);

  const scrollDown = () => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  };

  const markRead = useCallback(async (threadId: string) => {
    await fetch(`/api/threads/${threadId}/read`, { method: 'POST' }).catch(() => null);
  }, []);

  const openThread = useCallback(async () => {
    setError(null);
    const response = await fetch(`/api/orders/${orderId}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(companyId ? { companyId } : {}),
    }).catch(() => null);
    const body = await readJson(response);
    if (!response?.ok) {
      setError(errorOf(body, 'Не удалось открыть чат'));
      return null;
    }
    const threadId: string = body.thread.id;
    const page = await fetch(`/api/threads/${threadId}/messages`).catch(() => null);
    const data = await readJson(page);
    if (!page?.ok) {
      setError(errorOf(data, 'Не удалось загрузить сообщения'));
      return null;
    }
    setThread(data.thread);
    setMessages(data.messages);
    setNextCursor(data.nextCursor ?? null);
    lastIdRef.current = data.messages.at(-1)?.id ?? null;
    if (data.messages.some((m: PublicChatMessage) => !m.mine && !m.readAt)) void markRead(threadId);
    setTimeout(scrollDown, 0);
    return threadId;
  }, [orderId, companyId, markRead]);

  useEffect(() => {
    if (!open || thread) return;
    void openThread();
  }, [open, thread, openThread]);

  // New messages while the chat is open.
  useEffect(() => {
    if (!open || !thread) return;
    const timer = setInterval(async () => {
      if (document.hidden) return;
      const after = lastIdRef.current;
      const url = `/api/threads/${thread.id}/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`;
      const response = await fetch(url).catch(() => null);
      const data = await readJson(response);
      if (!response?.ok || !Array.isArray(data?.messages)) return;
      const fresh: PublicChatMessage[] = data.messages;
      setThread(data.thread);
      if (fresh.length === 0) return;
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...prev, ...fresh.filter((m) => !known.has(m.id))];
      });
      lastIdRef.current = fresh.at(-1)?.id ?? after;
      if (fresh.some((m) => !m.mine)) void markRead(thread.id);
      setTimeout(scrollDown, 0);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [open, thread, markRead]);

  const loadOlder = async () => {
    if (!thread || !nextCursor) return;
    const response = await fetch(
      `/api/threads/${thread.id}/messages?cursor=${encodeURIComponent(nextCursor)}`,
    ).catch(() => null);
    const data = await readJson(response);
    if (!response?.ok) return;
    setMessages((prev) => [...data.messages, ...prev]);
    setNextCursor(data.nextCursor ?? null);
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!thread || busy) return;
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const response = await fetch(`/api/threads/${thread.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }).catch(() => null);
    const data = await readJson(response);
    setBusy(false);
    if (!response?.ok) {
      setError(errorOf(data, 'Не удалось отправить'));
      return;
    }
    setText('');
    setMessages((prev) => [...prev, data.message]);
    lastIdRef.current = data.message.id;
    if (data.masked && data.notice) setNotice(data.notice);
    setTimeout(scrollDown, 0);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-fit rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
      >
        {label}
      </button>
    );
  }

  const canWrite = Boolean(thread?.canWrite) && !readOnly;
  return (
    <div className="ym-hide-content flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">
          Чат{thread ? ` · ${thread.counterpart}` : ''}
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-500 underline"
        >
          Свернуть
        </button>
      </div>
      {thread && !thread.contactsOpen && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {thread.notice ?? 'Контакты откроются после подтверждения брони'}: телефоны, e-mail и
          ссылки в сообщениях скрываются.
        </p>
      )}
      <div
        ref={listRef}
        className="flex max-h-80 min-h-[8rem] flex-col gap-2 overflow-y-auto rounded-xl bg-slate-50 p-2"
      >
        {nextCursor && (
          <button type="button" onClick={loadOlder} className="text-xs text-slate-500 underline">
            Показать раньше
          </button>
        )}
        {!thread && !error && <p className="text-sm text-slate-500">Загрузка…</p>}
        {thread && messages.length === 0 && (
          <p className="text-sm text-slate-500">
            Сообщений пока нет. Уточните детали работ, сроки и подачу техники.
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex flex-col ${message.mine ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] whitespace-pre-line break-words rounded-2xl px-3 py-2 text-sm ${
                message.mine ? 'bg-amber-500 text-slate-950' : 'bg-white text-slate-800 shadow-sm'
              }`}
            >
              {message.body}
              {message.attachmentUrl && (
                <a
                  href={message.attachmentUrl}
                  target="_blank"
                  rel="noopener"
                  className="mt-1 block text-xs underline"
                >
                  Вложение
                </a>
              )}
            </div>
            <span className="mt-0.5 text-[11px] text-slate-400">
              {timeOf(message.createdAt)}
              {message.mine && message.readAt ? ' · прочитано' : ''}
            </span>
          </div>
        ))}
      </div>
      {canWrite ? (
        <form onSubmit={send} className="flex flex-col gap-2">
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              maxLength={CHAT_MESSAGE_MAX_LENGTH}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void send(event);
              }}
              placeholder="Сообщение…"
              aria-label="Сообщение"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy || text.trim().length === 0}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
            >
              {busy ? '…' : 'Отправить'}
            </button>
          </div>
          {notice && <p className="text-xs text-amber-800">{notice}</p>}
        </form>
      ) : thread ? (
        <p className="text-xs text-slate-500">Только чтение.</p>
      ) : null}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
