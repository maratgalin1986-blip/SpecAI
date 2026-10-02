// The audio engine of the cinematic sound layer. Loaded with import() only
// after the visitor turns sound on; nothing here runs on the server.
//
// Buses (all into one compressor):
//   music  -20 dB under the effects   ┐
//   site   ambience (recording + synth)├─ beds: ducked while typing
//   machine  what is on screen         ┘
//   fx     one-shot cues
//   reverb a shared «open yard» send

import { MACHINE_VOICES, type SoundCue } from '@/lib/sound';
import type { MachineType } from '@/lib/machinePhotos';
import { SITE_SAMPLES, MACHINE_SAMPLES, type SampleName } from '@/lib/soundAssets';
import {
  renderArrival,
  renderBoom,
  renderClick,
  renderImpulse,
  renderMachine,
  renderMusic,
  renderSiteBed,
  renderSquelch,
  renderStart,
  renderThunk,
  renderWhoosh,
} from '@/lib/soundSynth';

const LEVEL = {
  master: 0.85,
  fx: 0.7,
  music: 0.07, // ≈ -20 dB under fx
  site: 0.22,
  machine: 0.42,
  reverb: 0.35,
};

/** Foreman lines for the background voices. */
export const FOREMAN_LINES = [
  'Вира помалу!',
  'Майна!',
  'Стоп, стоп! Держи!',
  'Сань, подавай самосвал!',
  'Ковш левее давай!',
  'Перекур пять минут.',
  'Аккуратно, кабель!',
  'Плиту на второй этаж, потихоньку.',
  'Так, бетон через двадцать минут будет.',
  'Каток сюда, тут ещё раз пройди.',
  'Ещё полметра, ещё… стоп!',
  'Мужики, стропы проверьте.',
];

type Voice = { source: AudioBufferSourceNode; gain: GainNode; type: MachineType };

export class SoundEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private beds: GainNode;
  private music: GainNode;
  private site: GainNode;
  private machine: GainNode;
  private fx: GainNode;
  private reverb: ConvolverNode;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private bedSources: AudioBufferSourceNode[] = [];
  private bedsOn = false;
  private voice: Voice | null = null;
  private machineToken = 0;
  private voiceTimer = 0;
  private ducked = false;
  private disposed = false;

  /** `ctx` is created by the director inside the visitor's gesture. */
  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    comp.connect(ctx.destination);
    this.master = this.gain(0, comp);
    this.master.gain.setTargetAtTime(LEVEL.master, ctx.currentTime, 0.4);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = renderImpulse(ctx);
    this.reverb.connect(this.gain(LEVEL.reverb, this.master));
    this.beds = this.gain(1, this.master);
    this.music = this.gain(0, this.beds);
    this.site = this.gain(0, this.beds);
    this.machine = this.gain(LEVEL.machine, this.beds);
    this.fx = this.gain(LEVEL.fx, this.master);
    this.music.connect(this.reverb);
    this.site.connect(this.reverb);
    this.fx.connect(this.reverb);
  }

  private gain(value: number, to: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    g.connect(to);
    return g;
  }

  get running(): boolean {
    return this.ctx.state === 'running';
  }

  async resume(): Promise<boolean> {
    if (this.disposed) return false;
    try {
      if (this.ctx.state !== 'running') await this.ctx.resume();
    } catch {
      /* not allowed yet: the next gesture tries again */
    }
    return this.running;
  }

  suspend(): void {
    if (this.ctx.state === 'running') void this.ctx.suspend().catch(() => {});
  }

  // ---- Buffers ------------------------------------------------------------

  private cached(key: string, make: () => Promise<AudioBuffer | null>) {
    let promise = this.buffers.get(key);
    if (!promise) {
      promise = make().catch(() => null);
      this.buffers.set(key, promise);
    }
    return promise;
  }

  private synth(key: string, make: () => AudioBuffer) {
    // Yield first, so a long render never lands inside a click handler.
    return this.cached(
      key,
      () =>
        new Promise<AudioBuffer | null>((resolve) => window.setTimeout(() => resolve(make()), 0)),
    );
  }

  /** A recording from /public/audio: Opus first, MP3 where Opus fails. */
  private sample(name: SampleName) {
    return this.cached(`file:${name}`, async () => {
      const probe = document.createElement('audio');
      const opus = probe.canPlayType('audio/webm; codecs=opus') !== '';
      const order = opus ? ['webm', 'mp3'] : ['mp3'];
      for (const ext of order) {
        try {
          const res = await fetch(`/audio/${name}.${ext}`);
          if (!res.ok) continue;
          const data = await res.arrayBuffer();
          return await this.ctx.decodeAudioData(data);
        } catch {
          /* try the next format */
        }
      }
      return null;
    });
  }

  private play(
    buffer: AudioBuffer | null,
    bus: AudioNode,
    { gain = 1, rate = 1, pan = 0, when = 0 } = {},
  ) {
    if (!buffer || this.disposed) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    let node: AudioNode = g;
    if (pan && typeof this.ctx.createStereoPanner === 'function') {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      node = p;
    }
    src.connect(g);
    node.connect(bus);
    src.start(this.ctx.currentTime + when);
    src.onended = () => {
      src.disconnect();
      node.disconnect();
    };
    return src;
  }

  // ---- Beds: music + site ambience + voices --------------------------------

  async startBeds(): Promise<void> {
    if (this.bedsOn || this.disposed) return;
    this.bedsOn = true;
    const now = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(now);
    this.site.gain.cancelScheduledValues(now);
    this.music.gain.setTargetAtTime(LEVEL.music, now, 1.2);
    this.site.gain.setTargetAtTime(LEVEL.site, now, 1.2);
    const [music, bed, ...recordings] = await Promise.all([
      this.synth('music', () => renderMusic(this.ctx)),
      this.synth('site', () => renderSiteBed(this.ctx)),
      ...SITE_SAMPLES.map((s) => this.sample(s.name)),
    ]);
    if (!this.bedsOn || this.disposed) return;
    const loop = (buffer: AudioBuffer | null | undefined, bus: GainNode, gain: number, pan = 0) => {
      const src = this.play(buffer ?? null, bus, { gain, pan });
      if (!src) return;
      src.loop = true;
      this.bedSources.push(src);
    };
    loop(music, this.music, 1);
    loop(bed, this.site, recordings.some(Boolean) ? 0.55 : 1);
    recordings.forEach((buffer, i) =>
      loop(buffer, this.site, SITE_SAMPLES[i]!.gain, SITE_SAMPLES[i]!.pan),
    );
    this.scheduleVoice();
  }

  stopBeds(): void {
    this.bedsOn = false;
    window.clearTimeout(this.voiceTimer);
    const now = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(0, now, 0.3);
    this.site.gain.setTargetAtTime(0, now, 0.3);
    const sources = this.bedSources;
    this.bedSources = [];
    window.setTimeout(() => sources.forEach((s) => s.stop()), 1500);
    cancelSpeech();
  }

  /** A foreman somewhere on the site, every 20–40 s, far back in the mix. */
  private scheduleVoice() {
    window.clearTimeout(this.voiceTimer);
    this.voiceTimer = window.setTimeout(
      () => {
        if (!this.bedsOn || this.disposed) return;
        if (this.running && !this.ducked && document.visibilityState === 'visible') {
          void this.sayLine();
        }
        this.scheduleVoice();
      },
      20000 + Math.random() * 20000,
    );
  }

  private async sayLine() {
    // No Russian voice in this browser: the foremen stay silent.
    if (!russianVoice()) return;
    const line = FOREMAN_LINES[Math.floor(Math.random() * FOREMAN_LINES.length)]!;
    // Half the time the line comes over a walkie-talkie.
    await this.say(line, Math.random() < 0.5);
  }

  /** A line from a scene (`sp:dialog`): a radio blip, then the words if possible. */
  async dialog(text: string): Promise<void> {
    if (!this.running || this.ducked) return;
    await this.say(text, true);
  }

  private async say(line: string, radio: boolean) {
    const voice = russianVoice();
    if (radio) {
      const squelch = await this.synth('squelch', () => renderSquelch(this.ctx));
      this.play(squelch, this.fx, { gain: 0.08, pan: Math.random() - 0.5 });
    }
    if (!voice || !line) return;
    const u = new SpeechSynthesisUtterance(line);
    u.voice = voice;
    u.lang = voice.lang;
    u.volume = 0.16;
    u.rate = 1 + Math.random() * 0.15;
    u.pitch = 0.65 + Math.random() * 0.3;
    try {
      window.speechSynthesis.speak(u);
    } catch {
      /* speech is optional */
    }
  }

  // ---- Machines -----------------------------------------------------------

  /**
   * Cross-fades to the idle loop of `type` (null: silence). `arrive` adds the
   * machine's short cue (rev, hydraulics, winch…), `quiet` is for pages
   * that only hum in the background.
   */
  async setMachine(type: MachineType | null, { arrive = false, quiet = false } = {}) {
    const token = ++this.machineToken;
    const old = this.voice;
    if (old && old.type === type) {
      old.gain.gain.setTargetAtTime(this.machineLevel(type, quiet), this.ctx.currentTime, 0.4);
      return;
    }
    const now = this.ctx.currentTime;
    if (old) {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setTargetAtTime(0, now, 0.35);
      const src = old.source;
      window.setTimeout(() => src.stop(), 2000);
      this.voice = null;
    }
    if (!type) return;
    const [idle, arrival, recording] = await Promise.all([
      this.synth(`machine:${type}`, () => renderMachine(this.ctx, type)),
      arrive ? this.synth(`arrive:${type}`, () => renderArrival(this.ctx, type)) : null,
      MACHINE_SAMPLES[type] ? this.sample(MACHINE_SAMPLES[type]!.name) : null,
    ]);
    if (token !== this.machineToken || this.disposed || !idle) return;
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.machine);
    const source = this.ctx.createBufferSource();
    source.buffer = idle;
    source.loop = true;
    source.playbackRate.value = 0.97 + Math.random() * 0.06;
    source.connect(gain);
    source.start(t, Math.random() * idle.duration);
    gain.gain.setTargetAtTime(this.machineLevel(type, quiet), t, 0.6);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    this.voice = { source, gain, type };
    if (arrival) this.play(arrival, this.machine, { gain: 0.9 });
    // A real recording of this kind of machine on top, once.
    const meta = MACHINE_SAMPLES[type];
    if (recording && meta && arrive) {
      this.play(recording, this.machine, { gain: meta.gain, pan: meta.pan ?? 0 });
    }
  }

  private machineLevel(type: MachineType | null, quiet: boolean) {
    if (!type) return 0;
    return MACHINE_VOICES[type].level * (quiet ? 0.35 : 0.75);
  }

  // ---- Cues ---------------------------------------------------------------

  async cue(cue: SoundCue, machine?: MachineType | null): Promise<void> {
    if (!this.running) return;
    switch (cue) {
      case 'click':
        this.play(await this.synth('click', () => renderClick(this.ctx)), this.fx, {
          gain: 0.18,
          rate: 0.9 + Math.random() * 0.2,
        });
        break;
      case 'thunk':
        this.play(await this.synth('thunk', () => renderThunk(this.ctx)), this.fx, { gain: 0.5 });
        break;
      case 'stamp':
        this.play(await this.synth('stamp', () => renderThunk(this.ctx, true)), this.fx, {
          gain: 0.6,
        });
        break;
      case 'whoosh':
        this.play(await this.synth('whoosh', () => renderWhoosh(this.ctx)), this.fx, {
          gain: 0.3,
        });
        break;
      case 'boom':
        this.play(await this.synth('boom', () => renderBoom(this.ctx)), this.fx, { gain: 0.65 });
        break;
      case 'start': {
        // The real diesel start where it loaded, the synthesized one otherwise.
        const recording = await this.sample('engine-start');
        const type = machine ?? 'backhoe';
        const buffer =
          recording ?? (await this.synth(`start:${type}`, () => renderStart(this.ctx, type)));
        this.play(buffer, this.fx, { gain: recording ? 0.35 : 0.4 });
        break;
      }
    }
  }

  /** Music, ambience and machines step back while the visitor types. */
  duck(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    this.beds.gain.setTargetAtTime(on ? 0.25 : 1, this.ctx.currentTime, on ? 0.15 : 0.6);
    if (on) cancelSpeech();
  }

  dispose(): void {
    this.disposed = true;
    this.stopBeds();
    window.clearTimeout(this.voiceTimer);
    void this.ctx.close().catch(() => {});
  }
}

function russianVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  try {
    const voices = window.speechSynthesis.getVoices();
    const ru = voices.filter((v) => v.lang.toLowerCase().startsWith('ru'));
    if (!ru.length) return null;
    // Prefer a male voice where the name says so.
    return ru.find((v) => /male|муж|yuri|pavel|maxim|dmitr/i.test(v.name)) ?? ru[0]!;
  } catch {
    return null;
  }
}

export function cancelSpeech(): void {
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    /* speech is optional */
  }
}
