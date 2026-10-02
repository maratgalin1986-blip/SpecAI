'use client';

import { useEffect, useState } from 'react';
import { CallbackForm } from '@/components/CallbackForm';
import { SITE } from '@/lib/site';
import { SPEAKERS, type Reply } from '@/lib/stroyka';
import type { RadioLine } from '@/lib/stroyka/context';
import { BANTER_NAMES, splitCensored, type BanterSpeaker } from '@/lib/stroykaJokes';
import { moodLine, type Mood } from '@/lib/stroyka/mood';
import { Portrait } from './Portraits';

export function Censored({ text }: { text: string }) {
  return (
    <>
      {splitCensored(text).map((part, i) =>
        part.censored ? (
          <b key={i} className="font-black text-red-400" title="цензура">
            {part.text}
          </b>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

// Counted in code points, so an emoji is never cut in half mid-typing.
function useTypewriter(text: string, instant: boolean) {
  const chars = Array.from(text);
  const total = chars.length;
  const [shown, setShown] = useState(instant ? total : 0);
  useEffect(() => {
    if (instant) {
      setShown(total);
      return;
    }
    setShown(0);
    const timer = window.setInterval(() => {
      setShown((n) => {
        if (n >= total) {
          window.clearInterval(timer);
          return n;
        }
        return n + 2;
      });
    }, 28);
    return () => window.clearInterval(timer);
  }, [text, instant, total]);
  const n = Math.min(shown, total);
  return { shown: n, total, text: chars.slice(0, n).join(''), finish: () => setShown(total) };
}

export interface DialogueChat {
  placeholder: string;
  quick: { label: string }[];
  onSend: (text: string) => void;
  onQuick: (index: number) => void;
  /** A phone number typed into the chat, waiting for consent. */
  phone: string | null;
  sending: boolean;
  onSendPhone: () => void;
}

export interface DialogueForm {
  message: string;
  needAddress: boolean;
  onAddress: (address: string) => void;
  onSubmit: () => void;
}

// Game-style dialogue: portrait, name, typewriter line, reply buttons.
// The reply buttons are always shown at once — the order never waits for text.
export function DialogueBox({
  speaker,
  text,
  mood = 'neutral',
  replies,
  radio = [],
  extra,
  form,
  chat,
  instant,
  skipTyping,
  onReply,
  onClose,
}: {
  speaker: BanterSpeaker;
  /** The line as shown, emojis included (lib/stroyka/mood.ts). */
  text: string;
  /** The speaker's mood: the portrait's expression. */
  mood?: Mood;
  replies: Reply[];
  radio?: RadioLine[];
  extra?: { speaker: BanterSpeaker; text: string } | null;
  form?: DialogueForm | null;
  chat?: DialogueChat | null;
  instant: boolean;
  /** Bumped by «Пропустить»: finishes the typewriter at once. */
  skipTyping: number;
  onReply: (reply: Reply) => void;
  onClose: () => void;
}) {
  const { shown, total, text: typed, finish } = useTypewriter(text, instant);
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    if (skipTyping) finish();
  }, [skipTyping]);
  const name = speaker === 'worker' ? BANTER_NAMES.worker : SPEAKERS[speaker].name;
  return (
    <section
      data-testid="dialogue"
      aria-live="polite"
      aria-label={`Говорит: ${name}`}
      className="pointer-events-auto mx-auto flex max-h-[52dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-amber-500/50 bg-slate-950/88 text-white shadow-2xl backdrop-blur-md"
    >
      <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
        {radio.length > 0 && (
          <div
            data-testid="radio-exchange"
            className="mb-2 rounded-lg border border-emerald-400/30 bg-emerald-950/40 p-2 font-mono text-xs text-emerald-200"
          >
            <div className="mb-1 text-[10px] uppercase tracking-widest text-emerald-400">
              Рация · кшш…
            </div>
            {radio.map((line, i) => (
              <p key={i}>
                <b>{SPEAKERS[line.speaker].name.split(' ').pop()}:</b> «
                {moodLine({ speaker: line.speaker, text: line.text, kind: 'radio' }).text}»{' '}
                <span className="opacity-60">кшш</span>
              </p>
            ))}
          </div>
        )}
        <div className="flex gap-3" onClick={finish}>
          <Portrait
            speaker={speaker}
            mood={mood}
            className="h-14 w-14 shrink-0 rounded-lg ring-2 ring-amber-400/70 sm:h-16 sm:w-16"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="font-mono text-xs font-bold uppercase tracking-wider text-amber-400">
                {name}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                aria-label="Закрыть диалог"
                className="-mr-1 -mt-1 rounded-full px-2 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-[15px] leading-snug sm:text-base" data-testid="dialogue-text">
              {typed}
              {shown < total && <span className="animate-pulse text-amber-400">▌</span>}
            </p>
          </div>
        </div>
        {form && (
          <div className="mt-3 rounded-xl bg-slate-900/80 p-3">
            {form.needAddress && (
              <form
                className="mb-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (address.trim()) form.onAddress(address.trim());
                }}
              >
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  maxLength={200}
                  placeholder="Адрес объекта (можно не точно)"
                  aria-label="Адрес объекта"
                  className="min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-400"
                />
                <button
                  type="submit"
                  className="rounded-md bg-white/10 px-3 text-sm font-semibold hover:bg-white/20"
                >
                  Готово
                </button>
              </form>
            )}
            <div onSubmit={form.onSubmit}>
              <CallbackForm
                key={form.message}
                source="stroyka"
                dark
                title="Наряд — Свете"
                subtitle={`${SITE.callbackPromise}. Всё, что вы рассказали, уже в заявке.`}
                defaultMessage={form.message}
              />
            </div>
          </div>
        )}
        {chat?.phone && (
          <div className="mt-3 rounded-xl bg-slate-900/80 p-3 text-sm" data-testid="phone-consent">
            <label className="flex items-start gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Согласен(на) на обработку персональных данных (
                <a href="/soglasie" className="underline" target="_blank">
                  согласие
                </a>
                ) в соответствии с{' '}
                <a href="/privacy" className="underline" target="_blank">
                  политикой конфиденциальности
                </a>
              </span>
            </label>
            <button
              type="button"
              disabled={!consent || chat.sending}
              onClick={chat.onSendPhone}
              className="mt-2 rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
            >
              {chat.sending ? 'Отправляем…' : `Отправить заявку: ${chat.phone}`}
            </button>
          </div>
        )}
        {extra && (
          <p
            className="mt-3 border-t border-white/10 pt-2 text-sm italic text-slate-300"
            data-testid="banter"
          >
            <b className="not-italic text-slate-400">{BANTER_NAMES[extra.speaker]}:</b>{' '}
            <Censored text={extra.text} />
          </p>
        )}
      </div>
      <div
        className="flex flex-wrap gap-2 border-t border-white/10 bg-slate-950/70 p-2 sm:p-3"
        data-testid="replies"
      >
        {replies.map((reply) => {
          const cls = `rounded-full px-3 py-2 text-sm font-semibold transition ${
            reply.primary
              ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`;
          return reply.action.kind === 'link' ? (
            <a
              key={reply.label}
              href={reply.action.href}
              className={cls}
              onClick={() => onReply(reply)}
            >
              {reply.label}
            </a>
          ) : (
            <button key={reply.label} type="button" className={cls} onClick={() => onReply(reply)}>
              {reply.label}
            </button>
          );
        })}
        {chat?.quick.map((q, i) => (
          <button
            key={`q-${q.label}`}
            type="button"
            onClick={() => chat.onQuick(i)}
            className="rounded-full border border-amber-400/50 px-3 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-400/10"
          >
            {q.label}
          </button>
        ))}
      </div>
      {chat && (
        <form
          data-testid="chat-form"
          className="flex gap-2 border-t border-white/10 bg-slate-950/80 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            const text = message.trim();
            if (!text) return;
            chat.onSend(text);
            setMessage('');
          }}
        >
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={300}
            placeholder={chat.placeholder}
            aria-label={chat.placeholder}
            enterKeyHint="send"
            className="min-w-0 flex-1 rounded-full border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-white placeholder:text-slate-400"
          />
          <button
            type="submit"
            className="rounded-full bg-white/10 px-4 text-sm font-semibold hover:bg-white/20"
          >
            Сказать
          </button>
        </form>
      )}
    </section>
  );
}
