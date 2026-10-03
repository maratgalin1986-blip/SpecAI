'use client';

import { useEffect, useRef, useState } from 'react';
import { AGENT_PROFILES, PUBLIC_AGENT_PROFILES, type AgentId } from '@specai/shared';
import { reachGoal } from '@/lib/marketing';
import { findPhone } from '@/lib/dispatcher';
import { ConsentText } from '@/components/ConsentText';

type Selection = AgentId | 'auto';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  agentId?: AgentId;
}

const AUTO_GREETING =
  'Здравствуйте! Я ИИ-ассистент СпецПласт16. Задайте вопрос — подключу нужного специалиста: ' +
  'консультанта, диспетчера или поддержку.';

function agentName(id?: AgentId) {
  return AGENT_PROFILES.find((p) => p.id === id)?.name ?? 'Ассистент';
}

// Turns bare site paths like /equipment/abc and markdown links into anchors,
// so agents' answers are clickable without pulling in a markdown renderer.
function renderContent(text: string) {
  const parts = text.split(
    /(\[[^\]]+\]\(\/[^)\s]*\)|(?<![\w/])\/(?:equipment|orders|dashboard|provider|login|register|recommend|agents|contacts|privacy)[\w/-]*)/g,
  );
  return parts.map((part, index) => {
    const md = part.match(/^\[([^\]]+)\]\((\/[^)\s]*)\)$/);
    if (md) {
      return (
        <a key={index} href={md[2]} className="font-medium text-amber-700 underline">
          {md[1]}
        </a>
      );
    }
    if (
      /^\/(?:equipment|orders|dashboard|provider|login|register|recommend|agents|contacts|privacy)/.test(
        part,
      )
    ) {
      return (
        <a key={index} href={part} className="font-medium text-amber-700 underline">
          {part}
        </a>
      );
    }
    return <span key={index}>{part.replace(/\*\*/g, '')}</span>;
  });
}

export function AgentChat({
  initialAgent = 'auto',
  compact = false,
  autoFocus = false,
}: {
  initialAgent?: Selection;
  compact?: boolean;
  /** Focus the message input on mount (the floating chat window). */
  autoFocus?: boolean;
}) {
  const [selection, setSelection] = useState<Selection>(initialAgent);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A phone typed into the chat becomes a callback request only with consent.
  const [consent, setConsent] = useState(false);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const typedPhone = findPhone(input);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const profile = AGENT_PROFILES.find((p) => p.id === selection);
  const greeting = profile?.greeting ?? AUTO_GREETING;
  const suggestions = profile?.suggestions ?? [
    'Нужен экскаватор под котлован',
    'Оформи заявку на автокран',
    'Какой статус у моих бронирований?',
  ];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isSending]);

  function changeAgent(next: Selection) {
    setSelection(next);
    setMessages([]);
    setError(null);
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || isSending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setError(null);
    setIsSending(true);

    try {
      const response = await fetch('/api/ai/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selection,
          messages: nextMessages.slice(-30).map(({ role, content: c }) => ({ role, content: c })),
          consent,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.reply) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Агент не ответил.');
      }
      // A phone number typed into the chat became a callback request.
      if (data.lead) {
        reachGoal('lead');
        setPendingPhone(null);
      }
      // The server saw a phone without consent: the box stays open with a resend button.
      if (data.needConsent && typeof data.phone === 'string') setPendingPhone(data.phone);
      setMessages([
        ...nextMessages,
        { role: 'assistant', content: data.reply, agentId: data.agentId },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Агент не ответил.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className={`flex flex-col ${compact ? 'h-full' : 'h-[640px]'} min-h-0`}>
      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 p-3">
        {(['auto', ...PUBLIC_AGENT_PROFILES.map((p) => p.id)] as Selection[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => changeAgent(id)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selection === id
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {id === 'auto' ? 'Авто' : agentName(id)}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        aria-live="polite"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
      >
        <Bubble role="assistant" label={profile?.name ?? 'Ассистент'}>
          {greeting}
        </Bubble>

        {messages.map((message, index) => (
          <Bubble
            key={index}
            role={message.role}
            label={message.role === 'assistant' ? agentName(message.agentId) : undefined}
          >
            <span className="ym-hide-content">
              {message.role === 'assistant' ? renderContent(message.content) : message.content}
            </span>
          </Bubble>
        ))}

        {isSending && (
          <div className="text-sm text-slate-500">
            {selection === 'auto' ? 'Подбираю специалиста…' : `${agentName(selection)} печатает…`}
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-left text-xs text-amber-800 hover:bg-amber-100"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-slate-200 px-3 pt-2">
        <button
          type="button"
          onClick={() => send('Что дальше?')}
          disabled={isSending}
          className="shrink-0 whitespace-nowrap rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
        >
          Что дальше?
        </button>
        <span className="text-xs text-slate-500">Помощник подскажет ваш следующий шаг</span>
      </div>
      {(typedPhone || pendingPhone) && (
        <div
          className="ym-hide-content border-t border-slate-200 px-3 pt-2 text-xs text-slate-600"
          data-testid="chat-consent"
        >
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
            />
            <ConsentText />
          </label>
          {pendingPhone && !typedPhone && (
            <button
              type="button"
              disabled={!consent || isSending}
              onClick={() => send(`Мой телефон: ${pendingPhone}`)}
              className="mt-2 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
            >
              Отправить заявку: {pendingPhone}
            </button>
          )}
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
        className="ym-hide-content flex gap-2 px-3 pt-3"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={4000}
          placeholder="Напишите сообщение…"
          aria-label="Сообщение"
          className="ym-hide-content min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50"
        >
          Отправить
        </button>
      </form>
      <p className="px-3 pb-2 pt-1 text-[11px] leading-snug text-slate-500">
        Сообщения обрабатывает ИИ-сервис (США); телефон и e-mail мы скрываем. Подробнее —{' '}
        <a href="/soglasie" className="underline hover:text-slate-700">
          согласие
        </a>
      </p>
    </div>
  );
}

function Bubble({
  role,
  label,
  children,
}: {
  role: 'user' | 'assistant';
  label?: string;
  children: React.ReactNode;
}) {
  const isUser = role === 'user';
  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      {label && <span className="mb-1 text-xs font-medium text-slate-500">{label}</span>}
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
          isUser ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-800'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
