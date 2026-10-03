import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIC_EVENT } from '@/lib/sound';
import { listen } from './voiceInput';

type Result = { 0: { transcript: string }; length: 1; isFinal?: boolean };

class FakeRecognition {
  static last: FakeRecognition;
  lang = '';
  continuous = true;
  interimResults = false;
  maxAlternatives = 0;
  stopped = 0;
  aborted = 0;
  onresult: ((event: { results: Result[] }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {}
  stop() {
    this.stopped++;
    this.onend?.();
  }
  abort() {
    this.aborted++;
  }
  say(...parts: [string, boolean?][]) {
    this.onresult?.({
      results: parts.map(([transcript, isFinal]) => ({ 0: { transcript }, length: 1, isFinal })),
    });
  }
}

const events: boolean[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  events.length = 0;
  const target = new EventTarget();
  vi.stubGlobal('window', {
    webkitSpeechRecognition: FakeRecognition,
    setTimeout,
    clearTimeout,
    addEventListener: target.addEventListener.bind(target),
    dispatchEvent: (e: Event) => {
      if (e.type === MIC_EVENT) events.push((e as CustomEvent<boolean>).detail);
      return true;
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('chat voice input', () => {
  it('keeps partial words when Safari never marks them final', () => {
    const onText = vi.fn();
    const onEnd = vi.fn();
    listen(onText, onEnd);
    const rec = FakeRecognition.last;
    expect(rec.interimResults).toBe(true);
    rec.say(['Нужен экскаватор'], [' на завтра']);
    expect(onText).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(rec.stopped).toBe(1);
    expect(onText).toHaveBeenCalledWith('Нужен экскаватор на завтра');
    expect(onEnd).toHaveBeenCalledWith(undefined);
  });

  it('a second tap finishes the phrase instead of throwing it away', () => {
    const onText = vi.fn();
    const stop = listen(onText, () => {})!;
    FakeRecognition.last.say(['Самосвал']);
    stop();
    expect(FakeRecognition.last.aborted).toBe(0);
    expect(onText).toHaveBeenCalledWith('Самосвал');
  });

  it('sends a final result once and lets the site sound step aside meanwhile', () => {
    const onText = vi.fn();
    listen(onText, () => {});
    expect(events).toEqual([true]);
    FakeRecognition.last.say(['Кран на субботу', true]);
    expect(onText).toHaveBeenCalledTimes(1);
    expect(events).toEqual([true, false]);
  });
});
