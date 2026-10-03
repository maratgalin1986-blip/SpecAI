import { describe, expect, it } from 'vitest';
import { renderBoom, renderClick, renderSiteEvent, renderThunk } from './soundSynth';
import { renderJob, SYNTH_JOBS, type SynthJob } from './soundSynthJobs';

// The synthesis worker renders by job name; it must give exactly the samples
// the engine used to render in place.
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

/** Byte-for-byte equal samples (a plain loop: toEqual on big arrays is slow). */
function sameSamples(a: AudioBuffer, b: AudioBuffer) {
  if (a.numberOfChannels !== b.numberOfChannels || a.length !== b.length) return false;
  for (let c = 0; c < a.numberOfChannels; c++) {
    const x = a.getChannelData(c);
    const y = b.getChannelData(c);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  }
  return true;
}

describe('synthesis jobs', () => {
  it('render the same samples as the direct calls', () => {
    const pairs: [SynthJob, AudioBuffer][] = [
      [{ name: 'boom' }, renderBoom(ctx)],
      [{ name: 'stamp' }, renderThunk(ctx, true)],
      [{ name: 'click' }, renderClick(ctx)],
      [{ name: 'event', arg: 'hammer' }, renderSiteEvent(ctx, 'hammer')],
    ];
    for (const [job, direct] of pairs) {
      const viaJob = renderJob(ctx, job);
      expect(viaJob.sampleRate).toBe(direct.sampleRate);
      expect(sameSamples(viaJob, direct)).toBe(true);
    }
  });

  it('cover every sound the engine asks for', () => {
    expect(Object.keys(SYNTH_JOBS).sort()).toEqual(
      [
        'arrive',
        'beep',
        'boom',
        'click',
        'event',
        'hiss',
        'impulse',
        'machine',
        'music',
        'site',
        'squelch',
        'stamp',
        'start',
        'thunk',
        'whoosh',
      ].sort(),
    );
  });
});
