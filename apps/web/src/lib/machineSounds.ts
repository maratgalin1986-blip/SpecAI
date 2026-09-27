// Cartoon sound effects for the 3D hero, synthesised with the Web Audio API —
// no audio files to download. Browsers only allow audio after a user gesture,
// so nothing plays until unlock() is called from a click/tap/keypress.

export type SoundName =
  | 'appear'
  | 'horn'
  | 'curious'
  | 'happy'
  | 'joy'
  | 'surprised'
  | 'sleepy'
  | 'snore'
  | 'lightsOn'
  | 'lightsOff'
  | 'dirt';

/** What the 3D scene needs from the sound system. */
export interface SceneSounds {
  /** Engine hum: level 0 (off) … 1 (full throttle); pitch is the idle frequency in Hz. */
  engine(level: number, pitch: number): void;
  play(name: SoundName): void;
}

export interface SoundEngine extends SceneSounds {
  unlock(): void;
  setMuted(muted: boolean): void;
  setSuspended(suspended: boolean): void;
  dispose(): void;
}

const MASTER_VOLUME = 0.6;

export function createSoundEngine(initiallyMuted: boolean): SoundEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let engineNodes: {
    osc1: OscillatorNode;
    osc2: OscillatorNode;
    lfo: OscillatorNode;
    gain: GainNode;
  } | null = null;
  let unlocked = false;
  let muted = initiallyMuted;
  let suspended = false;
  let lastLevel = -1;
  let lastPitch = -1;
  const lastPlayed = new Map<SoundName, number>();

  function context() {
    if (!unlocked) return null;
    if (ctx) return ctx;
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    ctx = new AudioContextClass();

    const compressor = ctx.createDynamicsCompressor();
    compressor.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOLUME;
    master.connect(compressor);

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Engine: two detuned low oscillators through a low-pass filter, with an
    // LFO "chug" on the volume.
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 40;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 80.5;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    const chug = ctx.createGain();
    chug.gain.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.3;
    lfo.connect(lfoDepth).connect(chug.gain);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(chug).connect(gain).connect(master);
    osc1.start();
    osc2.start();
    lfo.start();
    engineNodes = { osc1, osc2, lfo, gain };
    return ctx;
  }

  function blip(opts: {
    type: OscillatorType;
    from: number;
    to?: number;
    start?: number;
    duration: number;
    volume: number;
  }) {
    if (!ctx || !master) return;
    const t = ctx.currentTime + (opts.start ?? 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.from, t);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + opts.duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(opts.volume, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + opts.duration + 0.05);
  }

  function noise(opts: {
    filter: BiquadFilterType;
    frequency: number;
    q?: number;
    start?: number;
    attack?: number;
    duration: number;
    volume: number;
  }) {
    if (!ctx || !master || !noiseBuffer) return;
    const t = ctx.currentTime + (opts.start ?? 0);
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.filter;
    filter.frequency.value = opts.frequency;
    filter.Q.value = opts.q ?? 1;
    const gain = ctx.createGain();
    const attack = opts.attack ?? 0.005;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(opts.volume, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(t);
    source.stop(t + opts.duration + 0.05);
  }

  const SOUNDS: Record<SoundName, () => void> = {
    // "Boing!" as a machine pops onto the platform.
    appear() {
      blip({ type: 'sine', from: 180, to: 720, duration: 0.18, volume: 0.25 });
      blip({ type: 'sine', from: 720, to: 520, start: 0.18, duration: 0.16, volume: 0.2 });
      blip({ type: 'triangle', from: 1400, to: 2100, start: 0.05, duration: 0.12, volume: 0.05 });
    },
    // Cartoon "beep-beep".
    horn() {
      for (const [start, duration] of [
        [0, 0.12],
        [0.18, 0.22],
      ] as const) {
        blip({ type: 'square', from: 392, start, duration, volume: 0.06 });
        blip({ type: 'square', from: 494, start, duration, volume: 0.05 });
      }
    },
    curious() {
      blip({ type: 'triangle', from: 320, to: 560, duration: 0.28, volume: 0.15 });
    },
    happy() {
      [523, 659, 784].forEach((f, i) =>
        blip({ type: 'triangle', from: f, start: i * 0.09, duration: 0.14, volume: 0.12 }),
      );
    },
    joy() {
      [1047, 1319, 1568, 2093].forEach((f, i) =>
        blip({ type: 'sine', from: f, start: 0.35 + i * 0.07, duration: 0.14, volume: 0.1 }),
      );
    },
    surprised() {
      blip({ type: 'sine', from: 500, to: 950, duration: 0.16, volume: 0.18 });
    },
    // A yawn…
    sleepy() {
      blip({ type: 'triangle', from: 420, to: 190, duration: 0.6, volume: 0.1 });
    },
    // …and snoring.
    snore() {
      noise({ filter: 'lowpass', frequency: 320, attack: 0.6, duration: 1.1, volume: 0.12 });
      blip({ type: 'sine', from: 95, to: 70, duration: 1.1, volume: 0.05 });
    },
    lightsOn() {
      noise({ filter: 'highpass', frequency: 3000, duration: 0.04, volume: 0.25 });
      blip({ type: 'sine', from: 140, to: 280, start: 0.02, duration: 0.25, volume: 0.08 });
    },
    lightsOff() {
      noise({ filter: 'highpass', frequency: 2500, duration: 0.04, volume: 0.2 });
      blip({ type: 'sine', from: 220, to: 110, duration: 0.2, volume: 0.06 });
    },
    // Soil pouring / pushed dirt.
    dirt() {
      noise({
        filter: 'bandpass',
        frequency: 480,
        q: 0.8,
        attack: 0.06,
        duration: 0.7,
        volume: 0.2,
      });
    },
  };

  return {
    unlock() {
      unlocked = true;
      const c = context();
      if (c && c.state === 'suspended' && !suspended) void c.resume();
    },
    setMuted(next) {
      muted = next;
      if (ctx && master)
        master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, ctx.currentTime, 0.05);
    },
    setSuspended(next) {
      suspended = next;
      if (!ctx) return;
      if (next) void ctx.suspend();
      else if (unlocked) void ctx.resume();
    },
    engine(level, pitch) {
      if (!ctx || !engineNodes) return;
      if (Math.abs(level - lastLevel) < 0.01 && Math.abs(pitch - lastPitch) < 0.5) return;
      lastLevel = level;
      lastPitch = pitch;
      const t = ctx.currentTime;
      const frequency = pitch * (1 + level * 0.8);
      engineNodes.gain.gain.setTargetAtTime(level * 0.09, t, 0.08);
      engineNodes.osc1.frequency.setTargetAtTime(frequency, t, 0.1);
      engineNodes.osc2.frequency.setTargetAtTime(frequency * 2.01, t, 0.1);
      engineNodes.lfo.frequency.setTargetAtTime(8 + level * 10, t, 0.1);
    },
    play(name) {
      if (!ctx || muted) return;
      const now = ctx.currentTime;
      if (now - (lastPlayed.get(name) ?? -1) < 0.12) return;
      lastPlayed.set(name, now);
      SOUNDS[name]();
    },
    dispose() {
      void ctx?.close();
      ctx = null;
      engineNodes = null;
    },
  };
}
