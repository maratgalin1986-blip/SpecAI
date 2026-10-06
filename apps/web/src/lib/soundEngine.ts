// The audio engine of the sound layer. Loaded with import() only after the
// visitor turns sound on; nothing here runs on the server.
//
// Every sound is a real recording (soundAssets.ts), fetched when first needed:
// the beds after the first gesture, a machine when it is announced, a cue the
// first time it plays (the small interface cues are fetched with the beds).
// «По-людски» (owner, 2026-10-06): a little random pitch, level and variant
// on every play so nothing repeats like a robot; repeated cues get quieter
// over the session; everything fades in and out.
//
// Buses (all into one compressor):
//   music  ≈ -20 dB under the effects ┐
//   site   ambience + distant events  ├─ beds: ducked while typing
//   machine  what is on screen        ┘
//   fx     one-shot cues
//   reverb a shared «open yard» send

import { MACHINE_LEVELS, soundEnabled, type SoundCue } from '@/lib/sound';
import type { MachineType } from '@/lib/machinePhotos';
import {
  CITY_BED,
  CUE_SAMPLES,
  MACHINE_SOUNDS,
  MUSIC_BED,
  SITE_BEDS,
  SITE_EVENTS,
  type SampleName,
} from '@/lib/soundAssets';
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
import type { NatureEventDetail } from '@/lib/sceneEvents';
import { LOOPS, NatureLayer } from '@/lib/soundNature';

const ARRIVAL_GAP_S = 20;

/**
 * Decoded nature loops kept in memory: a few seconds of stereo PCM each, ~43 MB
 * if all of them stayed. The least recently used beyond this are let go (a
 * playing loop keeps its own reference) and decoded again when needed.
 */
const NATURE_BUFFERS_KEPT = 4;
const NATURE_LOOPS = new Set<SampleName>(LOOPS);
/** Recorded voice clips kept decoded; the rest are fetched again (from the HTTP cache). */
const CLIP_BUFFERS_KEPT = 24;

const LEVEL = {
  master: 0.85,
  fx: 0.5,
  music: 0.1, // the files are at one loudness: ≈ -20 dB under the effects
  site: 0.26,
  city: 0.45, // the light town under the site bed (relative to it)
  machine: 0.3, // owner: machines a little quieter under the voices
  reverb: 0.3,
  nature: 0.6, // rain, wind, birds and the town under the film tour
};

/** How loud each cue plays (before the session fatigue below), and how often at most. */
const CUE_LEVEL: Record<SoundCue, { gain: number; gapMs: number }> = {
  click: { gain: 0.32, gapMs: 120 },
  thunk: { gain: 0.5, gapMs: 250 },
  whoosh: { gain: 0.38, gapMs: 800 },
  stamp: { gain: 0.6, gapMs: 1500 },
  chime: { gain: 0.3, gapMs: 1500 },
  boom: { gain: 0.55, gapMs: 4000 },
  start: { gain: 0.45, gapMs: 3000 },
};

/**
 * Repeated cues get quieter: a burst (several presses within seconds) fades
 * fast and recovers in ~20 s; over the session each cue settles at no less
 * than half its level.
 */
export function cueFatigue(burst: number, total: number): number {
  const short = 1 / (1 + 0.35 * burst);
  const session = Math.max(0.5, 1 - 0.012 * Math.max(0, total - 10));
  return Math.max(0.25, short * session);
}

/** A random value in [1 - spread, 1 + spread]. */
const jitter = (spread: number) => 1 + (Math.random() * 2 - 1) * spread;

type Queued = { line: Line; radio: boolean; volume: number };

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

type SourceOptions = { gain?: number; rate?: number; pan?: number; when?: number; offset?: number };

type Voice = { source: AudioBufferSourceNode; gain: GainNode; type: MachineType };

export class SoundEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private beds: GainNode;
  private bedVerb: GainNode;
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
  private natureBus: GainNode;
  /** The opening film of /stroyka is on screen with its own soundtrack. */
  private film = false;
  /** Most recently used cache keys, per group with a cap (oldest first). */
  private recent = new Map<string, string[]>();
  /** The variant each group played last (the next one avoids it). */
  private lastVariant = new Map<string, string>();
  /** Per cue: recent presses (decaying), presses this session, last time. */
  private fatigue = new Map<SoundCue, { burst: number; total: number; at: number }>();

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
    this.reverb.buffer = yardImpulse(ctx);
    this.reverb.connect(this.gain(LEVEL.reverb, this.master));
    this.beds = this.gain(1, this.master);
    this.music = this.gain(0, this.beds);
    this.site = this.gain(0, this.beds);
    this.machine = this.gain(LEVEL.machine, this.beds);
    this.fx = this.gain(LEVEL.fx, this.master);
    // The beds' reverb send follows the beds' level (typing, the film).
    this.bedVerb = this.gain(1, this.reverb);
    this.music.connect(this.bedVerb);
    this.site.connect(this.bedVerb);
    this.fx.connect(this.reverb);
    // Nature sits with the beds: it steps back while the visitor types.
    const natureBus = this.gain(LEVEL.nature, this.beds);
    natureBus.connect(this.bedVerb);
    this.natureBus = natureBus;
    this.nature = new NatureLayer(
      ctx,
      natureBus,
      (name) => this.natureSample(name),
      (buffer, gain, pan, rate) => void this.play(buffer, natureBus, { gain, pan, rate }),
      () => this.oneShotsAllowed() && !this.film,
    );
  }

  /**
   * One-shots (cues, site events, chirps) play only now: while the
   * context is suspended (mic open, page hidden, before a gesture) or the sound
   * is off, a started source would wait and then go off together with all the
   * others at the next resume.
   */
  private oneShotsAllowed(): boolean {
    return !this.disposed && this.ctx.state === 'running' && soundEnabled();
  }

  /** Stops the random site events, voices and nature calls (mic, hidden page, sound off). */
  pauseTimers(): void {
    window.clearTimeout(this.voiceTimer);
    window.clearTimeout(this.eventTimer);
    this.voiceTimer = 0;
    this.eventTimer = 0;
    this.nature.pause();
  }

  /** Re-arms them once the context runs again (the director's onRunning). */
  resumeTimers(): void {
    if (this.film || !this.oneShotsAllowed()) return;
    if (this.bedsOn) {
      if (!this.voiceTimer) this.scheduleVoice();
      if (!this.eventTimer) this.scheduleSiteEvent();
    }
    this.nature.resume();
  }

  /**
   * The opening film plays its own soundtrack: the beds (music, site,
   * machines, nature) step out and the random events wait until it closes.
   */
  setFilm(on: boolean): void {
    if (this.film === on || this.disposed) return;
    this.film = on;
    this.levelBeds(on ? 0.2 : 0.8);
    if (on) {
      this.hush();
      this.pauseTimers();
    } else this.resumeTimers();
  }

  private levelBeds(timeConstant: number) {
    const level = this.film ? 0 : this.ducked ? 0.25 : 1;
    const now = this.ctx.currentTime;
    this.beds.gain.setTargetAtTime(level, now, timeConstant);
    this.bedVerb.gain.setTargetAtTime(level, now, timeConstant);
  }

  /** The weather of the film tour (null: the tour closed). */
  setNature(state: NatureEventDetail | null): void {
    if (!this.disposed) this.nature.set(state);
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

  /** Marks `key` as just used in `group`; drops the oldest beyond `cap` from the cache. */
  private touch(group: string, key: string, cap: number) {
    const list = (this.recent.get(group) ?? []).filter((k) => k !== key);
    list.push(key);
    while (list.length > cap) this.buffers.delete(list.shift()!);
    this.recent.set(group, list);
  }

  /** A nature recording; the big loops are kept only while recently used. */
  private natureSample(name: SampleName) {
    if (NATURE_LOOPS.has(name)) this.touch('nature', `file:${name}`, NATURE_BUFFERS_KEPT);
    return this.sample(name);
  }

  private clip(url: string) {
    const key = `clip:${url}`;
    this.touch('clip', key, CLIP_BUFFERS_KEPT);
    return this.cached(key, () => this.fetchClip(url));
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

  /** A one-shot: dropped unless it can be heard right now (see oneShotsAllowed). */
  private play(buffer: AudioBuffer | null, bus: AudioNode, options: SourceOptions = {}) {
    if (!this.oneShotsAllowed()) return null;
    return this.source(buffer, bus, options);
  }

  /** Starts a buffer through `bus` (loops too: those may start while suspended). */
  private source(
    buffer: AudioBuffer | null,
    bus: AudioNode,
    { gain = 1, rate = 1, pan = 0, when = 0, offset = 0 }: SourceOptions = {},
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
    src.start(this.ctx.currentTime + when, offset);
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
    this.natureBus.gain.cancelScheduledValues(now);
    // Slow fades in: the sound arrives like a door opening onto the yard.
    this.music.gain.setTargetAtTime(LEVEL.music, now, 2);
    this.site.gain.setTargetAtTime(LEVEL.site, now, 1.5);
    this.natureBus.gain.setTargetAtTime(LEVEL.nature, now, 0.8);
    // The small interface cues come along (a few KB each), so the first press
    // is heard at once.
    for (const name of [...CUE_SAMPLES.click, ...CUE_SAMPLES.thunk, ...CUE_SAMPLES.whoosh]) {
      void this.sample(name);
    }
    const bedName = SITE_BEDS[Math.floor(Math.random() * SITE_BEDS.length)]!;
    const [music, bed, city] = await Promise.all([
      this.sample(MUSIC_BED),
      this.sample(bedName),
      this.sample(CITY_BED),
    ]);
    if (!this.bedsOn || this.disposed) return;
    const loop = (buffer: AudioBuffer | null, bus: GainNode, gain: number, pan = 0) => {
      if (!buffer) return;
      // A random point of the loop: no two visits start the same way.
      const src = this.source(buffer, bus, { gain, pan, offset: Math.random() * buffer.duration });
      if (!src) return;
      src.loop = true;
      this.bedSources.push(src);
    };
    loop(music, this.music, 1);
    loop(bed, this.site, 1, -0.15);
    loop(city, this.site, LEVEL.city, 0.25);
    this.resumeTimers();
  }

  /** Distant work somewhere on the site: a hammer, a shovel, a back-up alarm… */
  private scheduleSiteEvent() {
    window.clearTimeout(this.eventTimer);
    const timer = window.setTimeout(
      async () => {
        if (!this.bedsOn || this.disposed) return;
        if (this.running && document.visibilityState === 'visible') {
          const event = this.pick(
            'event',
            SITE_EVENTS.map((e) => e.name),
          );
          const meta = SITE_EVENTS.find((e) => e.name === event)!;
          const buffer = await this.sample(event);
          // Paused (mic, hidden page, film, sound off) while it loaded: drop it.
          if (this.eventTimer !== timer) return;
          if (this.bedsOn) {
            this.play(buffer, this.site, {
              gain: meta.gain * (this.ducked ? 0.4 : 1) * jitter(0.15),
              pan: (Math.random() - 0.5) * 1.4,
              rate: jitter(0.04),
            });
          }
        }
        this.scheduleSiteEvent();
      },
      9000 + Math.random() * 9000,
    );
    this.eventTimer = timer;
  }

  stopBeds(): void {
    this.bedsOn = false;
    this.pauseTimers();
    const now = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(0, now, 0.3);
    this.site.gain.setTargetAtTime(0, now, 0.3);
    // Nature fades with them, so the suspend 900 ms later does not click.
    this.natureBus.gain.cancelScheduledValues(now);
    this.natureBus.gain.setTargetAtTime(0, now, 0.25);
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
        return this.clip(`/audio/stroyka/${key}.mp3`);
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
    // Half the time the line comes over a walkie-talkie; an answer follows in its own voice.
    const radio = Math.random() < 0.5;
    this.enqueue({ line, radio, volume: 0.16 });
    if (line.reply) this.enqueue({ line: line.reply, radio, volume: 0.16 });
  }

  /**
   * A line from a scene (`sp:dialog`). Lines are spoken one at a time, in
   * order, each with radio static before and after; a business line cuts
   * whatever is queued or playing, so nothing ever talks over it.
   */
  dialog(line: Line): void {
    if (!this.running || this.ducked || this.film) return;
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
      this.sample('radio-squelch'),
      this.sample('radio-beep'),
      line.kind === 'radio' ? this.sample('radio-hiss') : null,
    ]);
    const alive = () => token === this.speechToken && this.speakable();
    if (!alive()) return;
    if (radio) this.play(squelch, this.fx, { gain: 0.07, pan });
    // A recorded neural voice when the line has one (lib/stroyka/voice.ts).
    const clips = await clipsFor(line.text);
    if (clips && alive()) {
      const buffers = await Promise.all(clips.map((url) => this.clip(url)));
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
    // The arrival (a bucket of earth, a brake, a boom…) at most every 20 s:
    // the hero changes machines every few seconds and one each time tires.
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
      old.gain.gain.setTargetAtTime(0, now, 0.5);
      const src = old.source;
      window.setTimeout(() => stopSafely(src), 2500);
      this.voice = null;
    }
    if (!type) return;
    // Fetched only now, when the machine is announced.
    const sound = MACHINE_SOUNDS[type];
    const arrival = arrive ? this.pick(`arrive:${type}`, sound.arrive) : null;
    const [idle, arrivalBuffer] = await Promise.all([
      this.sample(sound.idle),
      arrival ? this.variant(arrival, sound.arrive) : null,
    ]);
    if (token !== this.machineToken || this.disposed) return;
    if (idle) {
      const t = this.ctx.currentTime;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.machine);
      const source = this.ctx.createBufferSource();
      source.buffer = idle;
      source.loop = true;
      source.playbackRate.value = sound.rate * jitter(0.03);
      source.connect(gain);
      source.start(t, Math.random() * idle.duration);
      // The engine fades in under the arrival rather than starting at once.
      gain.gain.setTargetAtTime(this.machineLevel(type, quiet), t + (arrivalBuffer ? 1 : 0), 0.8);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      this.voice = { source, gain, type };
    }
    if (arrivalBuffer) {
      this.play(arrivalBuffer, this.machine, {
        gain: 0.8 * jitter(0.1),
        rate: sound.rate * jitter(0.03),
        pan: (Math.random() - 0.5) * 0.5,
      });
    }
  }

  private machineLevel(type: MachineType | null, quiet: boolean) {
    if (!type) return 0;
    return MACHINE_LEVELS[type] * (quiet ? 0.35 : 0.75);
  }

  // ---- Cues ---------------------------------------------------------------

  /** One of `names`, at random, never the one this group played last. */
  private pick<T extends string>(group: string, names: readonly T[]): T {
    const last = this.lastVariant.get(group);
    const pool = names.length > 1 ? names.filter((n) => n !== last) : names;
    const name = pool[Math.floor(Math.random() * pool.length)]!;
    this.lastVariant.set(group, name);
    return name;
  }

  /** `name`, or another of `names` when its file does not load. */
  private async variant(name: SampleName, names: readonly SampleName[]) {
    const buffer = await this.sample(name);
    if (buffer) return buffer;
    for (const other of names) {
      if (other === name) continue;
      const fallback = await this.sample(other);
      if (fallback) return fallback;
    }
    return null;
  }

  /** The level factor for this press of `cue`, or 0 when it came too soon after the last. */
  private fatigueFor(cue: SoundCue): number {
    const now = performance.now();
    const f = this.fatigue.get(cue) ?? { burst: 0, total: 0, at: -Infinity };
    if (now - f.at < CUE_LEVEL[cue].gapMs) return 0;
    // Recent presses count less as time goes by (half-life 8 s).
    f.burst = f.burst * Math.pow(0.5, (now - f.at) / 8000);
    const factor = cueFatigue(f.burst, f.total);
    f.burst += 1;
    f.total += 1;
    f.at = now;
    this.fatigue.set(cue, f);
    return factor;
  }

  async cue(cue: SoundCue, _machine?: MachineType | null): Promise<void> {
    if (!this.running) return;
    const factor = this.fatigueFor(cue);
    if (!factor) return;
    const names = CUE_SAMPLES[cue];
    const buffer = await this.variant(this.pick(`cue:${cue}`, names), names);
    this.play(buffer, this.fx, {
      gain: CUE_LEVEL[cue].gain * factor * jitter(0.08),
      rate: jitter(0.03),
    });
    // A finished order: the stamp, then a quiet chime.
    if (cue === 'stamp') window.setTimeout(() => void this.cue('chime'), 320);
  }

  /** Music, ambience and machines step back while the visitor types. */
  duck(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    this.levelBeds(on ? 0.15 : 0.6);
    if (on) this.hush();
  }

  dispose(): void {
    this.disposed = true;
    this.nature.dispose();
    this.stopBeds();
    window.clearTimeout(this.voiceTimer);
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

/**
 * The «open yard» reverb: a short stereo impulse of decaying noise (made once,
 * ~1.4 s, a few milliseconds of work). It is a room, not a sound of its own.
 */
function yardImpulse(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 1.4);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    // Early reflections from the fence and the cabins, then a soft tail.
    for (let i = 0; i < length; i++) {
      const t = i / ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 4.2) * (t < 0.012 ? t / 0.012 : 1) * 0.5;
    }
  }
  return buffer;
}
