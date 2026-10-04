// The procedural sounds by name, so the engine can ask the synthesis worker
// (soundSynth.worker.ts) for one and fall back to rendering it in place.

import type { MachineType } from '@/lib/machinePhotos';
import {
  renderArrival,
  renderBeep,
  renderBoom,
  renderClick,
  renderHiss,
  renderImpulse,
  renderMachine,
  renderMusic,
  renderSiteBed,
  renderSiteEvent,
  renderSquelch,
  renderStart,
  renderThunk,
  renderWhoosh,
  type SiteEvent,
} from '@/lib/soundSynth';

export const SYNTH_JOBS = {
  music: (ctx: BaseAudioContext) => renderMusic(ctx),
  site: (ctx: BaseAudioContext) => renderSiteBed(ctx),
  impulse: (ctx: BaseAudioContext) => renderImpulse(ctx),
  machine: (ctx: BaseAudioContext, type: MachineType) => renderMachine(ctx, type),
  arrive: (ctx: BaseAudioContext, type: MachineType) => renderArrival(ctx, type),
  start: (ctx: BaseAudioContext, type: MachineType) => renderStart(ctx, type),
  event: (ctx: BaseAudioContext, kind: SiteEvent) => renderSiteEvent(ctx, kind),
  click: (ctx: BaseAudioContext) => renderClick(ctx),
  thunk: (ctx: BaseAudioContext) => renderThunk(ctx),
  stamp: (ctx: BaseAudioContext) => renderThunk(ctx, true),
  whoosh: (ctx: BaseAudioContext) => renderWhoosh(ctx),
  boom: (ctx: BaseAudioContext) => renderBoom(ctx),
  squelch: (ctx: BaseAudioContext) => renderSquelch(ctx),
  beep: (ctx: BaseAudioContext) => renderBeep(ctx),
  hiss: (ctx: BaseAudioContext) => renderHiss(ctx),
};

type Jobs = typeof SYNTH_JOBS;
export type SynthName = keyof Jobs;
/** One sound to render: its name and, for some, a machine type or event kind. */
export type SynthJob = {
  [K in SynthName]: Parameters<Jobs[K]>[1] extends undefined
    ? { name: K; arg?: undefined }
    : { name: K; arg: Parameters<Jobs[K]>[1] };
}[SynthName];
/** The samples of each channel (null: the render failed) at `rate`. */
export type SynthResult = {
  id: number;
  channels: Float32Array<ArrayBuffer>[] | null;
  rate: number;
};

/** Renders a job on this thread (the fallback when there is no worker). */
export function renderJob(ctx: BaseAudioContext, job: SynthJob): AudioBuffer {
  return SYNTH_JOBS[job.name](ctx, job.arg as never);
}
