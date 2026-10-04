// Renders the procedural sounds (soundSynth.ts) off the main thread. The music
// bed and the site bed alone took about a second of main-thread time on a
// mid-range phone, right in the middle of the opening titles and the /stroyka
// film, so they stuttered. Same code and the same seeded noise, so the sound
// is identical; the engine only copies the samples into an AudioBuffer.

import { renderJob, type SynthJob, type SynthResult } from '@/lib/soundSynthJobs';

type Scope = {
  onmessage:
    ((event: MessageEvent<{ id: number; job: SynthJob; sampleRate: number }>) => void) | null;
  postMessage(message: SynthResult, transfer: Transferable[]): void;
};
const scope = self as unknown as Scope;

/** Just enough of BaseAudioContext for the renderers: buffers in memory. */
function memoryContext(sampleRate: number) {
  return {
    sampleRate,
    createBuffer(channels: number, length: number, rate: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        duration: length / rate,
        getChannelData: (c: number) => data[c]!,
      };
    },
  } as unknown as BaseAudioContext;
}

scope.onmessage = ({ data: { id, job, sampleRate } }) => {
  try {
    const buffer = renderJob(memoryContext(sampleRate), job);
    const channels = Array.from(
      { length: buffer.numberOfChannels },
      (_, c) => buffer.getChannelData(c) as Float32Array<ArrayBuffer>,
    );
    scope.postMessage(
      { id, channels, rate: buffer.sampleRate },
      channels.map((ch) => ch.buffer),
    );
  } catch {
    scope.postMessage({ id, channels: null, rate: 0 }, []);
  }
};
