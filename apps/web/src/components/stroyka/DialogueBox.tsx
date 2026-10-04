'use client';

import { useEffect, useRef, useState } from 'react';
import { CallbackForm } from '@/components/CallbackForm';
import { SITE } from '@/lib/site';
import { SPEAKERS, type Reply } from '@/lib/stroyka';
import type { RadioLine } from '@/lib/stroyka/context';
import { BANTER_NAMES, splitCensored, type BanterSpeaker } from '@/lib/stroykaJokes';
import type { Mood } from '@/lib/stroyka/mood';
import { Portrait } from './Portraits';
import { ConsentText } from '@/components/ConsentText';
import { listen } from './voiceInput';

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
  return {
    shown: n,
    total,
    text: chars.slice(0, n).join(''),
    rest: chars.slice(n).join(''),
    finish: () => setShown(total),
  };
}

/** About two lines of a 390 px phone at 17 px bold. */
const PAGE_CHARS = 58;

/**
 * A line cut into film subtitles of at most ~two lines: whole sentences
 * where they fit, otherwise at a space.
 */
export function subtitlePages(text: string, max = PAGE_CHARS): string[] {
  const pieces: string[] = [];
  // No lookbehind: older iPhones cannot parse it.
  const sentences = (text.trim().match(/[^.!?…]+(?:[.!?…]+»?)?/g) ?? [text]).map((x) => x.trim());
  for (const sentence of sentences.filter(Boolean)) {
    if (sentence.length <= max) {
      pieces.push(sentence);
      continue;
    }
    let cur = '';
    for (const w of sentence.split(/\s+/).filter(Boolean)) {
      if (cur && `${cur} ${w}`.length > max) {
        pieces.push(cur);
        cur = w;
      } else cur = cur ? `${cur} ${w}` : w;
    }
    if (cur) pieces.push(cur);
  }
  const pages: string[] = [];
  for (const piece of pieces) {
    const last = pages[pages.length - 1];
    if (last && `${last} ${piece}`.length <= max) pages[pages.length - 1] = `${last} ${piece}`;
    else pages.push(piece);
  }
  return pages.length ? pages : [''];
}

/** Subtitle pages that advance at a reading pace and stop on the last one. */
function usePages(text: string, still: boolean) {
  const pages = subtitlePages(text);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [text]);
  const index = Math.min(page, pages.length - 1);
  const current = pages[index] ?? '';
  const last = index >= pages.length - 1;
  useEffect(() => {
    if (still || last) return;
    const ms = Math.min(6000, Math.max(2400, current.length * 70));
    const timer = window.setTimeout(() => setPage((p) => p + 1), ms);
    return () => window.clearTimeout(timer);
  }, [still, last, current]);
  return { current, index, count: pages.length };
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
  /** The visitor started typing or speaking: keep the window, stop the tour. */
  onEngage: () => void;
  /** The chat field lost focus: zones and offers may come again. */
  onRelease?: () => void;
}

export interface DialogueForm {
  message: string;
  /** The visitor's name, if told: the form starts with it. */
  name?: string;
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
  collapsed = false,
  onExpand,
  onCollapse,
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
  /**
   * Phones: a lower-third subtitle bar (the speaker's name plate and the line
   * in two-line pages); the replies and the input wait behind «Ответить».
   */
  collapsed?: boolean;
  /** «Ответить»: open the full box. */
  onExpand?: () => void;
  /** «Свернуть»: back to the subtitle bar (phones). */
  onCollapse?: () => void;
  onReply: (reply: Reply) => void;
  onClose: () => void;
}) {
  const { text: typed, rest, finish } = useTypewriter(text, instant || collapsed);
  const pages = usePages(text, instant || !collapsed);
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  // «🎤 Сказать» with an empty field: speech to text, then sent as typed.
  const [listening, setListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const stopVoice = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => stopVoice.current?.(), []);
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    if (skipTyping) finish();
  }, [skipTyping]);
  const name = speaker === 'worker' ? BANTER_NAMES.worker : SPEAKERS[speaker].name;
  if (collapsed)
    return (
      <section
        data-testid="dialogue"
        aria-live="polite"
        aria-label={`Говорит: ${name}`}
        className="ym-hide-content pointer-events-auto mx-auto flex h-[9.25rem] w-full max-w-2xl flex-col rounded-2xl bg-slate-950/95 px-3 pb-2 pt-2.5 text-white antialiased shadow-2xl"
      >
        <div className="flex items-center justify-between gap-2">
          {/* A simple name plate instead of the pixel portrait. */}
          <div className="min-w-0 truncate border-l-[3px] border-amber-400 pl-2 text-xs font-extrabold uppercase tracking-[0.14em] text-amber-300">
            {name}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть диалог"
            className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
        <p
          onClick={onExpand}
          aria-hidden
          data-testid="dialogue-text"
          className="mt-1 h-[2.7em] overflow-hidden text-[17px] font-bold leading-[1.35] text-white [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box]"
        >
          {pages.current}
        </p>
        <span className="sr-only">{text}</span>
        <div className="mt-auto flex items-center gap-2">
          <button
            type="button"
            data-testid="dialogue-expand"
            onClick={onExpand}
            className="min-h-11 flex-1 rounded-full bg-white px-4 text-sm font-extrabold text-slate-950 hover:bg-amber-100"
          >
            Ответить ▴
          </button>
          {pages.count > 1 && (
            <span aria-hidden className="flex shrink-0 gap-1 pr-1">
              {Array.from({ length: pages.count }, (_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${i === pages.index ? 'bg-amber-400' : 'bg-white/30'}`}
                />
              ))}
            </span>
          )}
        </div>
      </section>
    );
  return (
    <section
      data-testid="dialogue"
      aria-live="polite"
      aria-label={`Говорит: ${name}`}
      className="ym-hide-content pointer-events-auto mx-auto flex max-h-[52dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-amber-500/50 bg-slate-950 text-white antialiased shadow-2xl"
    >
      <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
        {radio.length > 0 && (
          <div
            data-testid="radio-exchange"
            className="mb-2 rounded-lg border border-emerald-400/40 bg-emerald-950 p-2 font-mono text-sm font-semibold text-emerald-100"
          >
            <div className="mb-1 text-sm font-semibold uppercase tracking-widest text-emerald-400">
              Рация · кшш…
            </div>
            {radio.map((line, i) => (
              <p key={i}>
                <b>{SPEAKERS[line.speaker].name.split(' ').pop()}:</b> «{line.text}»{' '}
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
              <div className="font-mono text-sm font-bold uppercase tracking-wider text-amber-400">
                {name}
              </div>
              <div className="-mr-1 -mt-1 flex shrink-0 items-center">
                {onCollapse && (
                  <button
                    type="button"
                    data-testid="dialogue-collapse"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCollapse();
                    }}
                    aria-label="Свернуть диалог"
                    className="grid h-9 min-w-9 place-items-center rounded-full px-2 text-sm font-bold text-slate-300 hover:text-white"
                  >
                    ▾
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                  }}
                  aria-label="Закрыть диалог"
                  className="grid h-9 min-w-9 place-items-center rounded-full px-2 text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>
            {/* The whole line is laid out from the first frame and the untyped
              part is only transparent, so the box never grows while typing. */}
            <p
              className="mt-1 text-base font-semibold leading-relaxed sm:text-[17px]"
              data-testid="dialogue-text"
            >
              {typed}
              {rest && (
                <span aria-hidden className="text-transparent">
                  {rest}
                </span>
              )}
            </p>
          </div>
        </div>
        {form && (
          <div className="mt-3 rounded-xl bg-slate-900/80 p-3">
            {form.needAddress && (
              <form
                className="ym-hide-content mb-3 flex gap-2"
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
                title="Заявка — Свете"
                subtitle={
                  form.message
                    ? `${SITE.callbackPromise}. Всё, что вы рассказали, уже в заявке.`
                    : `${SITE.callbackPromise}.`
                }
                defaultMessage={form.message}
                defaultName={form.name}
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
              <ConsentText />
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
            className="mt-3 border-t border-white/10 pt-2 text-[15px] font-semibold not-italic leading-snug text-white"
            data-testid="banter"
          >
            <b className="font-bold text-amber-300">{BANTER_NAMES[extra.speaker]}:</b>{' '}
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
          className="ym-hide-content flex gap-2 border-t border-white/10 bg-slate-950/80 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            const text = message.trim();
            if (text) {
              chat.onSend(text);
              setMessage('');
              setVoiceHint(null);
              return;
            }
            if (listening) {
              stopVoice.current?.();
              return;
            }
            // Empty field: speak instead of typing (or type, if the browser can't listen).
            const stop = listen(
              (heard) => {
                setVoiceHint(null);
                chat.onSend(heard);
              },
              (error) => {
                setListening(false);
                stopVoice.current = null;
                if (error === 'not-allowed' || error === 'service-not-allowed')
                  setVoiceHint('Микрофон не разрешён — напишите вопрос здесь');
                else if (error && error !== 'aborted')
                  setVoiceHint('Не расслышал — скажите ещё раз или напишите');
                else setVoiceHint(null);
              },
            );
            chat.onEngage();
            if (stop) {
              stopVoice.current = stop;
              setListening(true);
              setVoiceHint('Слушаю… говорите');
            } else {
              setVoiceHint('Напишите вопрос здесь и нажмите «Отправить»');
              inputRef.current?.focus();
            }
          }}
        >
          <input
            ref={inputRef}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              chat.onEngage();
            }}
            onFocus={chat.onEngage}
            onBlur={() => {
              if (!message.trim() && !listening) chat.onRelease?.();
            }}
            maxLength={300}
            placeholder={voiceHint ?? chat.placeholder}
            aria-label={chat.placeholder}
            enterKeyHint="send"
            className={`min-w-0 flex-1 rounded-full border bg-slate-900 px-4 py-2 text-sm text-white placeholder:text-slate-400 ${
              voiceHint ? 'border-amber-400 placeholder:text-amber-200' : 'border-slate-600'
            }`}
          />
          <button
            type="submit"
            aria-label={message.trim() ? 'Отправить' : 'Сказать голосом'}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold transition ${
              listening
                ? 'animate-pulse bg-red-500 text-white'
                : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
            }`}
          >
            {message.trim() ? 'Отправить' : listening ? '● Слушаю' : '🎤 Сказать'}
          </button>
        </form>
      )}
    </section>
  );
}
