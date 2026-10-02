import { describe, expect, it } from 'vitest';
import { MACHINE_TYPES } from './machinePhotos';
import { MACHINE_VOICES } from './sound';
import { MACHINE_SAMPLES, SITE_SAMPLES, SOUND_CREDITS } from './soundAssets';
import {
  renderArrival,
  renderBoom,
  renderClick,
  renderHiss,
  renderBeep,
  renderImpulse,
  renderMachine,
  renderMusic,
  renderSiteBed,
  renderSquelch,
  renderStart,
  renderThunk,
  renderWhoosh,
} from './soundSynth';

// Just enough of BaseAudioContext for the renderers: buffers in memory.
class FakeBuffer {
  private data: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(c: number) {
    return this.data[c]!;
  }
}
const ctx = {
  sampleRate: 48000,
  createBuffer: (ch: number, len: number, rate: number) => new FakeBuffer(ch, len, rate),
} as unknown as BaseAudioContext;

function check(buffer: AudioBuffer, maxPeak = 1) {
  let peak = 0;
  let finite = true;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    for (const v of buffer.getChannelData(c)) {
      if (!Number.isFinite(v)) finite = false;
      else if (Math.abs(v) > peak) peak = Math.abs(v);
    }
  }
  expect(finite).toBe(true);
  expect(peak).toBeGreaterThan(0.05);
  expect(peak).toBeLessThanOrEqual(maxPeak);
}

describe('procedural sounds', () => {
  it('renders a seamless music loop of whole chords', () => {
    const t0 = performance.now();
    const music = renderMusic(ctx);
    // Rendered once in the browser, off the click handler; keep it quick.
    expect(performance.now() - t0).toBeLessThan(1500);
    check(music);
    expect(music.duration).toBeGreaterThan(20);
    expect(music.duration).toBeLessThan(30);
    // The loop ends where it starts: no click at the seam.
    const ch = music.getChannelData(0);
    expect(Math.abs(ch[0]! - ch[ch.length - 1]!)).toBeLessThan(0.1);
  });

  it('renders the site bed and every machine', () => {
    check(renderSiteBed(ctx));
    for (const type of MACHINE_TYPES) {
      const idle = renderMachine(ctx, type);
      check(idle);
      expect(idle.duration).toBeGreaterThanOrEqual(2.9);
      check(renderArrival(ctx, type));
    }
  });

  it('renders short cues', () => {
    for (const cue of [
      renderClick(ctx),
      renderThunk(ctx),
      renderThunk(ctx, true),
      renderWhoosh(ctx),
      renderBoom(ctx),
      renderStart(ctx, 'truck'),
      renderSquelch(ctx),
      renderHiss(ctx),
      renderBeep(ctx),
    ]) {
      check(cue);
      expect(cue.duration).toBeLessThan(3);
    }
    expect(renderClick(ctx).duration).toBeLessThan(0.1);
    expect(renderImpulse(ctx).numberOfChannels).toBe(2);
  });
});

describe('sound map', () => {
  it('gives every machine type a voice', () => {
    for (const type of MACHINE_TYPES) expect(MACHINE_VOICES[type]).toBeDefined();
  });

  it('credits every recording it uses', () => {
    const credited = new Set(SOUND_CREDITS.map((c) => c.name));
    for (const s of SITE_SAMPLES) expect(credited.has(s.name)).toBe(true);
    for (const s of Object.values(MACHINE_SAMPLES)) expect(credited.has(s!.name)).toBe(true);
    for (const c of SOUND_CREDITS) expect(c.license).toMatch(/^(CC0|CC BY|Public domain)/);
  });
});
