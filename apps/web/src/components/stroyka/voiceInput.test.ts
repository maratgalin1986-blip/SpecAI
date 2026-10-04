import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIC_EVENT } from '@/lib/sound';
import { listen } from './voiceInput';

type Result = { 0: { transcript: string }; length: 1; isFinal?: boolean };

class FakeRecognition {
  static last: FakeRecognition;
  /** Like iOS at times: stop() closes nothing and onend never comes. */
  static silentStop = false;
  static failStart = false;
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
  start() {
    if (FakeRecognition.failStart) throw new Error('InvalidStateError');
  }
  stop() {
    this.stopped++;
    if (!FakeRecognition.silentStop) this.onend?.();
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
  FakeRecognition.silentStop = false;
  FakeRecognition.failStart = false;
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

  it('finishes by itself, once, when onend never comes after a stop', () => {
    FakeRecognition.silentStop = true;
    const onText = vi.fn();
    const onEnd = vi.fn();
    const stop = listen(onText, onEnd)!;
    const rec = FakeRecognition.last;
    rec.say(['Нужен кран']);
    stop();
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1600);
    expect(rec.aborted).toBe(1);
    expect(onText).toHaveBeenCalledWith('Нужен кран');
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(events).toEqual([true, false]);
    // A late onend after the abort changes nothing.
    rec.onend?.();
    vi.advanceTimersByTime(20_000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onText).toHaveBeenCalledTimes(1);
    expect(events).toEqual([true, false]);
  });

  it('gives the microphone back when start() throws', () => {
    FakeRecognition.failStart = true;
    const onEnd = vi.fn();
    expect(listen(() => {}, onEnd)).toBeNull();
    expect(events).toEqual([true, false]);
    vi.advanceTimersByTime(20_000);
    expect(FakeRecognition.last.stopped).toBe(0);
    expect(onEnd).not.toHaveBeenCalled();
    expect(events).toEqual([true, false]);
  });

  it('closes with no-speech when nothing is heard for six seconds', () => {
    const onText = vi.fn();
    const onEnd = vi.fn();
    listen(onText, onEnd);
    vi.advanceTimersByTime(5900);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(FakeRecognition.last.stopped).toBe(1);
    expect(onText).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledWith('no-speech');
    expect(events).toEqual([true, false]);
  });

  it('shows the words so far through the interim callback', () => {
    const onInterim = vi.fn();
    listen(
      () => {},
      () => {},
      onInterim,
    );
    FakeRecognition.last.say(['Нужен']);
    FakeRecognition.last.say(['Нужен экскаватор']);
    expect(onInterim).toHaveBeenLastCalledWith('Нужен экскаватор');
    vi.advanceTimersByTime(6100);
    // Words were heard: the no-speech timeout does not fire on top of the silence stop.
    expect(FakeRecognition.last.stopped).toBe(1);
  });
});
