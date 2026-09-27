'use client';

import { useEffect, useRef, useState } from 'react';
import { AGENT_PROFILES, type AgentId } from '@specai/shared';

type Selection = AgentId | 'auto';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  agentId?: AgentId;
}

const AUTO_GREETING =
  'Здравствуйте! Я ИИ-ассистент СпецПласт16. Задайте вопрос — подключу нужного специалиста: ' +
  'консультанта, диспетчера, поддержку или помощника поставщика.';

function agentName(id?: AgentId) {
  return AGENT_PROFILES.find((p) => p.id === id)?.name ?? 'Ассистент';
}

// Turns bare site paths like /equipment/abc and markdown links into anchors,
// so agents' answers are clickable without pulling in a markdown renderer.
function renderContent(text: string) {
  const parts = text.split(
    /(\[[^\]]+\]\(\/[^)\s]*\)|(?<![\w/])\/(?:equipment|orders|dashboard|provider|login|register|recommend|agents)[\w/-]*)/g,
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
    if (/^\/(?:equipment|orders|dashboard|provider|login|register|recommend|agents)/.test(part)) {
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
}: {
  initialAgent?: Selection;
  compact?: boolean;
}) {
  const [selection, setSelection] = useState<Selection>(initialAgent);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.reply) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Агент не ответил.');
      }
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
        {(['auto', ...AGENT_PROFILES.map((p) => p.id)] as Selection[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => changeAgent(id)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selection === id
                ? 'bg-amber-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {id === 'auto' ? 'Авто' : agentName(id)}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <Bubble role="assistant" label={profile?.name ?? 'Ассистент'}>
          {greeting}
        </Bubble>

        {messages.map((message, index) => (
          <Bubble
            key={index}
            role={message.role}
            label={message.role === 'assistant' ? agentName(message.agentId) : undefined}
          >
            {message.role === 'assistant' ? renderContent(message.content) : message.content}
          </Bubble>
        ))}

        {isSending && (
          <div className="text-sm text-slate-500">
            {selection === 'auto' ? 'Подбираю специалиста…' : `${agentName(selection)} печатает…`}
          </div>
        )}
        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
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

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t border-slate-200 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={4000}
          placeholder="Напишите сообщение…"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          Отправить
        </button>
      </form>
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
