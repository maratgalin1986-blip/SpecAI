// Speech to text for the site chat («🎤 Сказать»): the browser's own speech
// recognition (Chrome, Edge, Safari on iPhone), Russian, one phrase. Nothing
// is recorded by the site; where the browser has none, the caller falls back
// to the keyboard.

import { MIC_EVENT } from '@/lib/sound';

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const voiceSupported = () => ctor() !== null;

/** Pause after the last word before the phrase counts as said. */
const SILENCE_MS = 1400;
/** The microphone never stays open longer than this. */
const MAX_MS = 12_000;

/**
 * Listens for one phrase. Calls `onText` with the words (or never, if the
 * visitor said nothing) and `onEnd` when the microphone closes; returns a
 * function that finishes listening and keeps what was heard.
 *
 * Safari on iPhone (owner, 2026-10-03: «не слышит меня чат») often never
 * marks a result final and never closes the microphone by itself, and the
 * old second tap aborted and threw the words away. So partial results are
 * kept, a pause of SILENCE_MS ends the phrase, a tap ends it too (stop, not
 * abort), and the site's own sound steps aside while the microphone is open
 * (MIC_EVENT), since iOS hears nothing while a page plays audio.
 */
export function listen(
  onText: (text: string) => void,
  onEnd: (error?: string) => void,
): (() => void) | null {
  const Ctor = ctor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = 'ru-RU';
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let failed: string | undefined;
  let heard = '';
  let sent = false;
  let silence = 0;
  const deliver = () => {
    if (sent || !heard) return;
    sent = true;
    onText(heard);
  };
  const finish = () => {
    try {
      rec.stop();
    } catch {
      /* already closed */
    }
  };
  rec.onresult = (event) => {
    let text = '';
    let final = false;
    for (let i = 0; i < event.results.length; i++) {
      const r = event.results[i]!;
      text += r[0]?.transcript ?? '';
      if (r.isFinal) final = true;
    }
    heard = text.trim();
    window.clearTimeout(silence);
    if (final) {
      deliver();
      finish();
    } else if (heard) silence = window.setTimeout(finish, SILENCE_MS);
  };
  rec.onerror = (event) => {
    failed = event.error;
  };
  const cap = window.setTimeout(finish, MAX_MS);
  rec.onend = () => {
    window.clearTimeout(silence);
    window.clearTimeout(cap);
    micActive(false);
    deliver();
    onEnd(sent ? undefined : failed);
  };
  micActive(true);
  try {
    rec.start();
  } catch {
    window.clearTimeout(cap);
    micActive(false);
    return null;
  }
  return finish;
}

function micActive(on: boolean) {
  if (on) window.speechSynthesis?.cancel();
  window.dispatchEvent(new CustomEvent<boolean>(MIC_EVENT, { detail: on }));
}
