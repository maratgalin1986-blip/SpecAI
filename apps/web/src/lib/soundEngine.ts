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
import { SITE_EVENTS } from '@/lib/soundSynth';
import { renderJob, type SynthJob, type SynthResult } from '@/lib/soundSynthJobs';
import {
  isFemaleVoice,
  moodVoice,
  SITE_LINES,
  speechParts,
  styleFor,
  voiceFor,
  type Line,
  type Speaker,
} from '@/lib/soundVoices';
import { clipsFor } from '@/lib/stroyka/voice';
import type { Ground, NatureEventDetail } from '@/lib/sceneEvents';
import { NatureLayer } from '@/lib/soundNature';

const ARRIVAL_GAP_S = 20;

const LEVEL = {
  master: 0.85,
  fx: 0.7,
  music: 0.07, // ≈ -20 dB under fx
  site: 0.22,
  machine: 0.28, // owner: machines a little quieter under the voices
  reverb: 0.35,
  nature: 0.6, // rain, wind, birds, steps around the 3D site
};

type Queued = { line: Line; radio: boolean; volume: number };

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

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
  /** The synthesis worker (null: none, render in place; undefined: not started yet). */
  private worker: Worker | null | undefined;
  private jobs = new Map<number, (result: SynthResult) => void>();
  private lastJob = 0;
  private bedSources: AudioBufferSourceNode[] = [];
  private bedsOn = false;
  private voice: Voice | null = null;
  private machineToken = 0;
  private lastArrival = -Infinity;
  private eventTimer = 0;
  private voiceTimer = 0;
  private ducked = false;
  private speechToken = 0;
  private speechQueue: Queued[] = [];
  private speaking = false;
  private lastSpeaker: Speaker | null = null;
  private finishLine: (() => void) | null = null;
  private disposed = false;
  private nature: NatureLayer;

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
    // The impulse arrives from the synthesis worker a moment later; until then
    // the reverb send is simply silent.
    void this.synth('impulse', { name: 'impulse' }).then((buffer) => {
      if (buffer && !this.disposed) this.reverb.buffer = buffer;
    });
    this.reverb.connect(this.gain(LEVEL.reverb, this.master));
    this.beds = this.gain(1, this.master);
    this.music = this.gain(0, this.beds);
    this.site = this.gain(0, this.beds);
    this.machine = this.gain(LEVEL.machine, this.beds);
    this.fx = this.gain(LEVEL.fx, this.master);
    this.music.connect(this.reverb);
    this.site.connect(this.reverb);
    this.fx.connect(this.reverb);
    // Nature sits with the beds: it steps back while the visitor types.
    const natureBus = this.gain(LEVEL.nature, this.beds);
    natureBus.connect(this.reverb);
    this.nature = new NatureLayer(
      ctx,
      natureBus,
      (name) => this.sample(name),
      (buffer, gain, pan, rate) => void this.play(buffer, natureBus, { gain, pan, rate }),
    );
  }

  /** The weather around the visitor on the 3D site (null: the scene closed). */
  setNature(state: NatureEventDetail | null): void {
    if (!this.disposed) this.nature.set(state);
  }

  setSteps(moving: boolean, ground: Ground): void {
    if (!this.disposed) this.nature.setSteps(moving, ground);
  }

  thunder(): void {
    if (!this.disposed) this.nature.thunder();
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

  /**
   * A procedural sound, rendered in the synthesis worker so the opening titles
   * and films keep their frame rate; in place (after a yield, so a long render
   * never lands inside a click handler) where workers are unavailable.
   */
  private synth(key: string, job: SynthJob) {
    return this.cached(key, async () => (await this.renderOffThread(job)) ?? this.renderHere(job));
  }

  private renderHere(job: SynthJob) {
    return new Promise<AudioBuffer>((resolve) =>
      window.setTimeout(() => resolve(renderJob(this.ctx, job)), 0),
    );
  }

  private renderOffThread(job: SynthJob): Promise<AudioBuffer | null> {
    const worker = this.synthWorker();
    if (!worker) return Promise.resolve(null);
    const id = ++this.lastJob;
    return new Promise((resolve) => {
      this.jobs.set(id, ({ channels, rate }) => {
        if (!channels?.length) return resolve(null);
        try {
          const buffer = this.ctx.createBuffer(channels.length, channels[0]!.length, rate);
          channels.forEach((ch, c) => buffer.copyToChannel(ch, c));
          resolve(buffer);
        } catch {
          resolve(null);
        }
      });
      worker.postMessage({ id, job, sampleRate: this.ctx.sampleRate });
    });
  }

  private synthWorker(): Worker | null {
    if (this.worker !== undefined) return this.worker;
    this.worker = null;
    if (typeof Worker === 'undefined') return null;
    try {
      const worker = new Worker(new URL('./soundSynth.worker.ts', import.meta.url));
      worker.onmessage = (event: MessageEvent<SynthResult>) => {
        const done = this.jobs.get(event.data.id);
        this.jobs.delete(event.data.id);
        done?.(event.data);
      };
      // The worker did not load: what is pending, and everything later, renders here.
      worker.onerror = () => {
        worker.terminate();
        this.worker = null;
        const pending = [...this.jobs.values()];
        this.jobs.clear();
        pending.forEach((done) => done({ id: 0, channels: null, rate: 0 }));
      };
      this.worker = worker;
    } catch {
      /* no worker: render in place */
    }
    return this.worker;
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
      this.synth('music', { name: 'music' }),
      this.synth('site', { name: 'site' }),
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
    this.scheduleSiteEvent();
  }

  /** Hammer, grinder, back-up alarm, clank or horn somewhere on the site. */
  private scheduleSiteEvent() {
    window.clearTimeout(this.eventTimer);
    this.eventTimer = window.setTimeout(
      async () => {
        if (!this.bedsOn || this.disposed) return;
        if (this.running && document.visibilityState === 'visible') {
          const kind = SITE_EVENTS[Math.floor(Math.random() * SITE_EVENTS.length)]!;
          const buffer = await this.synth(`event:${kind}`, { name: 'event', arg: kind });
          if (this.bedsOn) {
            this.play(buffer, this.site, {
              gain: (this.ducked ? 0.25 : 0.55) * (kind === 'reverse' ? 0.5 : 1),
              pan: (Math.random() - 0.5) * 1.6,
              rate: 0.92 + Math.random() * 0.16,
            });
          }
        }
        this.scheduleSiteEvent();
      },
      5000 + Math.random() * 7000,
    );
  }

  stopBeds(): void {
    this.bedsOn = false;
    window.clearTimeout(this.voiceTimer);
    window.clearTimeout(this.eventTimer);
    const now = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(0, now, 0.3);
    this.site.gain.setTargetAtTime(0, now, 0.3);
    const sources = this.bedSources;
    this.bedSources = [];
    window.setTimeout(() => sources.forEach(stopSafely), 1500);
    this.hush();
  }

  /** A foreman somewhere on the site, every 20–40 s, far back in the mix. */
  private scheduleVoice() {
    window.clearTimeout(this.voiceTimer);
    this.voiceTimer = window.setTimeout(
      () => {
        if (!this.bedsOn || this.disposed) return;
        if (this.running && !this.ducked && document.visibilityState === 'visible') {
          this.sayLine();
        }
        this.scheduleVoice();
      },
      20000 + Math.random() * 20000,
    );
  }

  private sayLine() {
    if (this.speaking) return;
    // Workers talking somewhere on the site, in the recorded neural voices.
    void this.sayRecordedLine().then((said) => {
      if (said || this.speaking) return;
      this.saySynthLine();
    });
  }

  /** A random recorded line far back in the mix; false when there are none. */
  private async sayRecordedLine(): Promise<boolean> {
    const { VOICE_CLIPS } = await import('@/lib/stroyka/voiceClips').catch(() => ({
      VOICE_CLIPS: {} as Record<string, string[]>,
    }));
    const pool = Object.values(VOICE_CLIPS);
    if (!pool.length) return false;
    const keys = pool[Math.floor(Math.random() * pool.length)]!;
    const buffers = await Promise.all(
      keys.map((key) => {
        const url = `/audio/stroyka/${key}.mp3`;
        return this.cached(`clip:${url}`, () => this.fetchClip(url));
      }),
    );
    if (!buffers.every(Boolean) || this.speaking || !this.speakable()) return false;
    this.speaking = true;
    const radio = Math.random() < 0.4;
    await this.playClips(
      buffers as AudioBuffer[],
      radio,
      0.09,
      (Math.random() - 0.5) * 1.4,
      this.site,
    );
    this.speaking = false;
    return true;
  }

  private saySynthLine() {
    // No Russian voice in this browser, or someone is talking: stay quiet.
    if (!russianVoices().length || this.speaking) return;
    const line = SITE_LINES[Math.floor(Math.random() * SITE_LINES.length)]!;
    // Half the time the line comes over a walkie-talkie.
    this.enqueue({ line, radio: Math.random() < 0.5, volume: 0.16 });
  }

  /**
   * A line from a scene (`sp:dialog`). Lines are spoken one at a time, in
   * order, each with radio static before and after; a business line cuts
   * whatever is queued or playing, so nothing ever talks over it.
   */
  dialog(line: Line): void {
    if (!this.running || this.ducked) return;
    if (line.kind === 'business') this.hush();
    this.enqueue({
      line,
      radio: true,
      volume: line.kind === 'business' ? 0.32 : 0.26,
    });
  }

  /** Stops the current and queued lines (and any pending beeps). */
  hush(): void {
    this.speechToken++;
    this.speechQueue = [];
    cancelSpeech();
    this.finishLine?.();
  }

  private speakable() {
    return this.running && !this.ducked && !this.disposed && document.visibilityState === 'visible';
  }

  private enqueue(item: Queued) {
    this.speechQueue.push(item);
    if (!this.speaking) void this.drain();
  }

  private async drain() {
    this.speaking = true;
    while (this.speechQueue.length) {
      const item = this.speechQueue.shift()!;
      // Radio exchanges: a short pause when the other side answers.
      const answer = this.lastSpeaker && this.lastSpeaker !== item.line.speaker;
      await wait(item.line.kind === 'radio' && answer ? 650 : 150);
      await this.say(item);
      this.lastSpeaker = item.line.speaker;
    }
    this.speaking = false;
  }

  /** Speaks one line; resolves when it is over or was cut. */
  private async say({ line, radio, volume }: Queued): Promise<void> {
    const token = this.speechToken;
    const voice = voiceFor(line.speaker, russianVoices());
    const style = moodVoice(styleFor(line.speaker, isFemaleVoice(voice)), line.mood);
    const pan = Math.random() - 0.5;
    const [squelch, beep, hiss] = await Promise.all([
      this.synth('squelch', { name: 'squelch' }),
      this.synth('beep', { name: 'beep' }),
      line.kind === 'radio' ? this.synth('hiss', { name: 'hiss' }) : null,
    ]);
    const alive = () => token === this.speechToken && this.speakable();
    if (!alive()) return;
    if (radio) this.play(squelch, this.fx, { gain: 0.07, pan });
    // A recorded neural voice when the line has one (lib/stroyka/voice.ts).
    const clips = await clipsFor(line.text);
    if (clips && alive()) {
      const buffers = await Promise.all(
        clips.map((url) => this.cached(`clip:${url}`, () => this.fetchClip(url))),
      );
      if (!alive()) return;
      if (buffers.every(Boolean)) {
        await this.playClips(buffers as AudioBuffer[], line.kind === 'radio', volume, pan);
        if (radio && alive()) this.play(squelch, this.fx, { gain: 0.05, pan });
        return;
      }
    }
    if (!voice) return;
    // speechSynthesis cannot go through Web Audio, so the «walkie-talkie» is
    // the static around the words and a faint band-limited hiss under them.
    const bed = hiss ? this.play(hiss, this.fx, { gain: 0.025, pan }) : null;
    if (bed) bed.loop = true;
    // Emojis are for the eyes: many engines read «🚜» aloud as «трактор».
    const parts = speechParts(line.text);
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.finishLine = null;
        if (bed) stopSafely(bed);
        resolve();
      };
      this.finishLine = finish;
      // Parts are chained through onend; a «#@%&!» run is a 1 kHz beep instead.
      const next = (i: number) => {
        if (!alive()) return finish();
        const part = parts[i];
        if (!part) {
          if (radio) this.play(squelch, this.fx, { gain: 0.05, pan });
          return finish();
        }
        if (part.beep) {
          this.play(beep, this.fx, { gain: 0.1 });
          window.setTimeout(() => next(i + 1), 420);
          return;
        }
        const u = new SpeechSynthesisUtterance(part.text);
        u.voice = voice;
        u.lang = voice.lang;
        u.volume = volume;
        u.rate = style.rate;
        u.pitch = style.pitch;
        // Some engines never fire onend: move on after a generous guess.
        const guard = window.setTimeout(() => next(i + 1), 2500 + part.text.length * 110);
        let moved = false;
        u.onend = u.onerror = () => {
          window.clearTimeout(guard);
          if (moved) return;
          moved = true;
          next(i + 1);
        };
        try {
          window.speechSynthesis.speak(u);
        } catch {
          window.clearTimeout(guard);
          finish();
        }
      };
      window.setTimeout(() => next(0), radio ? 220 : 0);
    });
  }

  private async fetchClip(url: string): Promise<AudioBuffer | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  /**
   * Plays recorded clips back to back through the effects bus; a radio line
   * is band-limited like a walkie-talkie. Resolves at the end or when cut.
   */
  private playClips(
    buffers: AudioBuffer[],
    radio: boolean,
    volume: number,
    pan: number,
    bus: AudioNode = this.fx,
  ) {
    return new Promise<void>((resolve) => {
      const out = this.ctx.createGain();
      out.gain.value = Math.min(1, volume * 3);
      let tail: AudioNode = out;
      if (radio) {
        const band = this.ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 1700;
        band.Q.value = 0.7;
        out.connect(band);
        tail = band;
      }
      if (pan && typeof this.ctx.createStereoPanner === 'function') {
        const p = this.ctx.createStereoPanner();
        p.pan.value = pan * 0.5;
        tail.connect(p);
        tail = p;
      }
      tail.connect(bus);
      const sources: AudioBufferSourceNode[] = [];
      let at = this.ctx.currentTime + 0.05;
      for (const buffer of buffers) {
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(out);
        src.start(at);
        at += buffer.duration + 0.08;
        sources.push(src);
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        this.finishLine = null;
        for (const src of sources) stopSafely(src);
        window.setTimeout(() => tail.disconnect(), 100);
        resolve();
      };
      const timer = window.setTimeout(finish, (at - this.ctx.currentTime) * 1000 + 50);
      this.finishLine = finish;
    });
  }

  // ---- Machines -----------------------------------------------------------

  /**
   * Cross-fades to the idle loop of `type` (null: silence). `arrive` adds the
   * machine's short cue (rev, hydraulics, winch…), `quiet` is for pages
   * that only hum in the background.
   */
  async setMachine(type: MachineType | null, { arrive = false, quiet = false } = {}) {
    const token = ++this.machineToken;
    // The arrival cue (a rev, a winch…) at most every 20 s: the hero changes
    // machines every few seconds and a rev each time gets tiring.
    if (arrive && this.ctx.currentTime - this.lastArrival < ARRIVAL_GAP_S) arrive = false;
    if (arrive) this.lastArrival = this.ctx.currentTime;
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
      window.setTimeout(() => stopSafely(src), 2000);
      this.voice = null;
    }
    if (!type) return;
    const [idle, arrival, recording] = await Promise.all([
      this.synth(`machine:${type}`, { name: 'machine', arg: type }),
      arrive ? this.synth(`arrive:${type}`, { name: 'arrive', arg: type }) : null,
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
        this.play(await this.synth('click', { name: 'click' }), this.fx, {
          gain: 0.18,
          rate: 0.9 + Math.random() * 0.2,
        });
        break;
      case 'thunk':
        this.play(await this.synth('thunk', { name: 'thunk' }), this.fx, { gain: 0.5 });
        break;
      case 'stamp':
        this.play(await this.synth('stamp', { name: 'stamp' }), this.fx, {
          gain: 0.6,
        });
        break;
      case 'whoosh':
        this.play(await this.synth('whoosh', { name: 'whoosh' }), this.fx, {
          gain: 0.3,
        });
        break;
      case 'boom':
        this.play(await this.synth('boom', { name: 'boom' }), this.fx, { gain: 0.65 });
        break;
      case 'start': {
        const type = machine ?? 'backhoe';
        this.play(await this.synth(`start:${type}`, { name: 'start', arg: type }), this.fx, {
          gain: 0.4,
        });
        break;
      }
    }
  }

  /** Music, ambience and machines step back while the visitor types. */
  duck(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    this.beds.gain.setTargetAtTime(on ? 0.25 : 1, this.ctx.currentTime, on ? 0.15 : 0.6);
    if (on) this.hush();
  }

  dispose(): void {
    this.disposed = true;
    this.nature.dispose();
    this.stopBeds();
    window.clearTimeout(this.voiceTimer);
    this.worker?.terminate();
    this.worker = null;
    void this.ctx.close().catch(() => {});
  }
}

function stopSafely(source: AudioScheduledSourceNode) {
  try {
    source.stop();
  } catch {
    /* already stopped */
  }
}

function russianVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  try {
    return window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('ru'));
  } catch {
    return [];
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
