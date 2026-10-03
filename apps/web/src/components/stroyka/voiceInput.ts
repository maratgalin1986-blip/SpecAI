// Speech to text for the site chat («🎤 Сказать»): the browser's own speech
// recognition (Chrome, Edge, Safari on iPhone), Russian, one phrase. Nothing
// is recorded by the site; where the browser has none, the caller falls back
// to the keyboard.

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
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

/**
 * Listens for one phrase. Calls `onText` with the words (or never, if the
 * visitor said nothing) and `onEnd` when the microphone closes; returns a stop function.
 */
export function listen(
  onText: (text: string) => void,
  onEnd: (error?: string) => void,
): (() => void) | null {
  const Ctor = ctor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = 'ru-RU';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  let failed: string | undefined;
  rec.onresult = (event) => {
    const text = event.results[0]?.[0]?.transcript?.trim();
    if (text) onText(text);
  };
  rec.onerror = (event) => {
    failed = event.error;
  };
  rec.onend = () => onEnd(failed);
  try {
    rec.start();
  } catch {
    return null;
  }
  return () => rec.abort();
}
