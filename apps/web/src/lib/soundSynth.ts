// Procedural sounds for the cinematic layer, computed sample by sample into
// AudioBuffers (no files, no CPU-heavy live graphs): the music bed, the
// diesel engine of every machine, the machine-specific layers and the
// one-shot cues. Every loop is rendered a little longer and its tail is
// cross-faded into its head, so it repeats without a seam.

import { MACHINE_VOICES, type MachineVoice } from '@/lib/sound';
import type { MachineType } from '@/lib/machinePhotos';

/** Low rate for the long beds: they hold nothing above ~8 kHz anyway. */
export const BED_RATE = 22050;
const TAU = Math.PI * 2;

/** Small seeded RNG, so a loop sounds the same on every visit. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

/** One-pole low-pass coefficient for a cutoff. */
const lpK = (cutoff: number, rate: number) => 1 - Math.exp((-TAU * cutoff) / rate);

/** Chamberlin state-variable filter; returns [low, band, high]. */
function svf(cutoff: number, q: number, rate: number) {
  let low = 0;
  let band = 0;
  const f = 2 * Math.sin((Math.PI * Math.min(cutoff, rate / 6)) / rate);
  const damp = 1 / q;
  return {
    set(c: number) {
      return 2 * Math.sin((Math.PI * Math.min(c, rate / 6)) / rate);
    },
    run(x: number, ff = f): [number, number, number] {
      low += ff * band;
      const high = x - low - damp * band;
      band += ff * high;
      return [low, band, high];
    },
  };
}

type Channels = Float32Array[];

/** Folds the tail of an over-long render back into its head (seamless loop). */
function fold(data: Channels, loop: number, tail: number) {
  for (const ch of data) {
    for (let i = 0; i < tail; i++) {
      const fade = i / tail;
      ch[i] = ch[i]! * fade + ch[loop + i]! * (1 - fade);
    }
  }
}

function toBuffer(ctx: BaseAudioContext, data: Channels, length: number, rate: number) {
  const buffer = ctx.createBuffer(data.length, length, rate);
  data.forEach((ch, c) => buffer.getChannelData(c).set(ch.subarray(0, length)));
  return buffer;
}

function normalize(data: Channels, peak = 0.9) {
  let max = 0;
  for (const ch of data) for (let i = 0; i < ch.length; i++) max = Math.max(max, Math.abs(ch[i]!));
  if (max > 0) {
    const k = peak / max;
    for (const ch of data) for (let i = 0; i < ch.length; i++) ch[i]! *= k;
  }
}

/** Renders `seconds` of loop (+ a cross-faded tail) with a per-sample callback. */
function renderLoop(
  ctx: BaseAudioContext,
  seconds: number,
  channels: number,
  rate: number,
  fill: (data: Channels, length: number) => void,
  peak = 0.9,
): AudioBuffer {
  const loop = Math.round(seconds * rate);
  const tail = Math.round(Math.min(0.5, seconds / 4) * rate);
  const data = Array.from({ length: channels }, () => new Float32Array(loop + tail));
  fill(data, loop + tail);
  fold(data, loop, tail);
  normalize(data, peak);
  return toBuffer(ctx, data, loop, rate);
}

function renderShot(
  ctx: BaseAudioContext,
  seconds: number,
  channels: number,
  fill: (data: Channels, length: number, rate: number) => void,
  peak = 0.9,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.round(seconds * rate);
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  fill(data, length, rate);
  // Short fades at both ends: no clicks.
  const edge = Math.min(64, length >> 2);
  for (const ch of data) {
    for (let i = 0; i < edge; i++) {
      ch[i]! *= i / edge;
      ch[length - 1 - i]! *= i / edge;
    }
  }
  normalize(data, peak);
  return toBuffer(ctx, data, length, rate);
}

// ---- Music bed -----------------------------------------------------------

const NOTE = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// D minor, tense but heroic: Dm – B♭ – F – C | Dm – B♭ – Gm – A(sus4→A).
const CHORDS: number[][] = [
  [50, 57, 62, 65],
  [46, 58, 62, 65],
  [41, 57, 60, 65],
  [48, 55, 60, 64],
  [50, 57, 62, 65],
  [46, 58, 62, 65],
  [43, 58, 62, 67],
  [45, 57, 62, 64],
];
const BPM = 76;

/** A seamless ~25 s cinematic loop: pad, string ostinato, low drums, ticks. */
export function renderMusic(ctx: BaseAudioContext): AudioBuffer {
  const rate = BED_RATE;
  const beat = 60 / BPM;
  const chordLen = beat * 4;
  const seconds = chordLen * CHORDS.length;
  const rand = rng(7);
  const n = CHORDS.length;
  // Everything per chord is precomputed; the sample loop only adds numbers.
  const padL = CHORDS.map((c) => c.slice(1).map((m) => (NOTE(m) * 1.004) / rate));
  const padR = CHORDS.map((c) => c.slice(1).map((m) => (NOTE(m) * 0.996) / rate));
  const bassF = CHORDS.map((c) => (TAU * NOTE(c[0]! - 12)) / rate);
  const PAT = [0, 12, 7, 12, 0, 12, 7, 15];
  const ostF = CHORDS.map((c) => PAT.map((p) => NOTE(c[0]! + 12 + p) / rate));
  const blendLen = Math.round(0.7 * rate);
  const beatLen = beat * rate;
  const eighthLen = beatLen / 2;
  const sixLen = beatLen / 4;
  const envK = Math.exp(-9 / rate);
  const tickK = Math.exp(-220 / rate);
  const lpk = lpK(900, rate);
  // Drum hit shape, computed once (0.6 s).
  const hitLen = Math.round(0.6 * rate);
  const hit = new Float32Array(hitLen);
  let hp = 0;
  for (let j = 0; j < hitLen; j++) {
    const dt = j / rate;
    hp += (48 + 40 * Math.exp(-dt * 25)) / rate;
    hit[j] = Math.sin(TAU * hp) * Math.exp(-dt * 6);
  }
  return renderLoop(
    ctx,
    seconds,
    2,
    rate,
    (data, length) => {
      const [L, R] = data as [Float32Array, Float32Array];
      const loopLen = Math.round(seconds * rate);
      const chordSamples = loopLen / n;
      const phL = new Float64Array(8);
      const phR = new Float64Array(8);
      let lpL = 0;
      let lpR = 0;
      let bassPh = 0;
      let ostPh = 0;
      let env = 0;
      let tick = 0;
      let lastEighth = -1;
      let lastSix = -1;
      for (let i = 0; i < length; i++) {
        const li = i % loopLen;
        const ci = Math.min(n - 1, Math.floor(li / chordSamples));
        const inChord = li - ci * chordSamples;
        const pi = (ci + n - 1) % n;
        const blend = inChord < blendLen ? inChord / blendLen : 1;
        // Pad: two detuned saws per note, one per side, cross-faded between chords.
        let pl = 0;
        let pr = 0;
        const cur = padL[ci]!;
        for (let v = 0; v < cur.length; v++) {
          phL[v] = (phL[v]! + cur[v]!) % 1;
          phR[v] = (phR[v]! + padR[ci]![v]!) % 1;
          pl += (phL[v]! * 2 - 1) * blend;
          pr += (phR[v]! * 2 - 1) * blend;
        }
        if (blend < 1) {
          const prev = padL[pi]!;
          for (let v = 0; v < prev.length; v++) {
            const a = ((li * prev[v]!) % 1) * 2 - 1;
            const b = ((li * padR[pi]![v]!) % 1) * 2 - 1;
            pl += a * (1 - blend);
            pr += b * (1 - blend);
          }
        }
        const swell = 0.6 + 0.4 * Math.sin((TAU * li) / loopLen);
        lpL += lpk * swell * (pl - lpL);
        lpR += lpk * swell * (pr - lpR);
        let l = lpL * 0.05;
        let r = lpR * 0.05;

        // Bass: sustained root, an octave down.
        bassPh += bassF[ci]!;
        const bass = Math.sin(bassPh) * 0.22 * blend;
        l += bass;
        r += bass;

        // String ostinato: plucked eighths, the heartbeat of a trailer.
        const ei = Math.floor(li / eighthLen);
        if (ei !== lastEighth) {
          lastEighth = ei;
          env = 1;
          ostPh = 0;
        }
        env *= envK;
        ostPh = (ostPh + ostF[ci]![ei % 8]!) % 1;
        const saw = ostPh * 2 - 1;
        const tri = Math.abs(saw) * 2 - 1;
        const os = (tri * 0.6 + saw * 0.15) * env * 0.12;
        l += os * (ei % 2 ? 0.7 : 1);
        r += os * (ei % 2 ? 1 : 0.7);

        // Low drums: beats 1 and 3, a ghost on the «and» of 4, a big one every 4 chords.
        const bi = Math.floor(li / beatLen);
        const bt = Math.floor(li - bi * beatLen);
        const inBar = bi % 4;
        let drum = 0;
        if ((inBar === 0 || inBar === 2) && bt < hitLen) drum += hit[bt]! * 0.55;
        if (bi % 16 === 0 && bt < hitLen) drum += hit[bt]! * 0.4;
        const ghost = Math.floor(bt - eighthLen);
        if (inBar === 3 && ghost >= 0 && ghost < hitLen) drum += hit[ghost]! * 0.25;
        l += drum;
        r += drum;

        // Ticking sixteenths (clock-like tension), very quiet.
        const si = Math.floor(li / sixLen);
        if (si !== lastSix) {
          lastSix = si;
          tick = 1;
        }
        tick *= tickK;
        const tk = rand() * tick * 0.035;
        l += tk * 0.8;
        r += tk;

        L[i] = l;
        R[i] = r;
      }
    },
    0.8,
  );
}

// ---- Construction-site ambience (synthesized layer) ----------------------

/** ~30 s of distant site: low machinery roar, clanks, knocks, a far beeper. */
export function renderSiteBed(ctx: BaseAudioContext): AudioBuffer {
  const rate = BED_RATE;
  const seconds = 30;
  const rand = rng(11);
  type Event = { at: number; kind: 'clank' | 'knock' | 'beeper' | 'rattle'; pan: number };
  const events: Event[] = [];
  for (let t = 0.6; t < seconds - 1; t += 1.2 + (rand() + 1) * 2.2) {
    const r = rand();
    events.push({
      at: t,
      kind: r < -0.2 ? 'clank' : r < 0.4 ? 'knock' : 'rattle',
      pan: rand() * 0.8,
    });
  }
  events.push({ at: 12, kind: 'beeper', pan: -0.5 });
  return renderLoop(
    ctx,
    seconds,
    2,
    rate,
    (data, length) => {
      const [L, R] = data as [Float32Array, Float32Array];
      let brown = 0;
      let lp1 = 0;
      let lp2 = 0;
      const k = lpK(260, rate);
      for (let i = 0; i < length; i++) {
        const t = i / rate;
        // Distant roar: brown noise, low-passed, slowly breathing.
        brown = (brown + rand() * 0.02) * 0.998;
        lp1 += k * (brown - lp1);
        lp2 += k * (lp1 - lp2);
        // A far diesel chugging at ~27 Hz underneath.
        const chug = Math.sin(TAU * 27 * t) * (0.5 + 0.5 * Math.sin(TAU * 0.07 * t));
        const bed = lp2 * 3 + chug * 0.03;
        L[i] = bed;
        R[i] = bed * 0.9 + lp1 * 0.4;
      }
      for (const ev of events) {
        const start = Math.round(ev.at * rate);
        const gl = 0.5 - ev.pan * 0.5;
        const gr = 0.5 + ev.pan * 0.5;
        if (ev.kind === 'beeper') {
          // Reversing beeper, far away: five beeps, 1 per second.
          for (let n = 0; n < 5; n++) {
            const s = start + Math.round(n * rate);
            for (let j = 0; j < 0.42 * rate && s + j < length; j++) {
              const tt = j / rate;
              const v = Math.sign(Math.sin(TAU * 1040 * tt)) * 0.04 * Math.min(1, tt * 200);
              L[s + j]! += v * gl;
              R[s + j]! += v * gr;
            }
          }
          continue;
        }
        const partials =
          ev.kind === 'clank'
            ? [620, 1130, 1790, 2610]
            : ev.kind === 'knock'
              ? [180, 410, 760]
              : [900, 1500, 2300];
        const decay = ev.kind === 'clank' ? 5 : ev.kind === 'knock' ? 30 : 14;
        const repeats = ev.kind === 'rattle' ? 4 : ev.kind === 'knock' ? 3 : 1;
        for (let n = 0; n < repeats; n++) {
          const s = start + Math.round(n * (ev.kind === 'knock' ? 0.42 : 0.09) * rate);
          const amp = (ev.kind === 'clank' ? 0.09 : 0.06) * (1 - n * 0.15);
          const len = Math.min(1.2, 6 / decay) * rate;
          for (let j = 0; j < len && s + j < length; j++) {
            const tt = j / rate;
            let v = 0;
            for (let p = 0; p < partials.length; p++) {
              v += Math.sin(TAU * partials[p]! * (1 + p * 0.003) * tt) / (p + 1);
            }
            v *= Math.exp(-tt * decay) * amp;
            L[s + j]! += v * gl;
            R[s + j]! += v * gr;
          }
        }
      }
    },
    0.7,
  );
}

// ---- Machines -------------------------------------------------------------

/** Diesel idle + the machine's layer, ~3 s seamless loop, mono. */
export function renderMachine(ctx: BaseAudioContext, type: MachineType): AudioBuffer {
  const voice = MACHINE_VOICES[type];
  const rate = BED_RATE;
  // A whole number of firing cycles and of layer periods.
  const seconds = Math.max(3, Math.round(3 * voice.rpm) / voice.rpm);
  const rand = rng(type.length * 977 + voice.rpm);
  return renderLoop(ctx, seconds, 1, rate, (data, length) => {
    const out = data[0]!;
    engineInto(out, length, rate, voice, rand, seconds);
    layerInto(out, length, rate, voice.layer, rand, seconds, 1);
  });
}

function engineInto(
  out: Float32Array,
  length: number,
  rate: number,
  voice: MachineVoice,
  rand: () => number,
  seconds: number,
  rpmAt?: (t: number) => number,
  gainAt?: (t: number) => number,
) {
  let phase = 0;
  let cycleAmp = 1;
  let lp1 = 0;
  let lp2 = 0;
  let grit = 0;
  const k = lpK(voice.tone, rate);
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const f = rpmAt ? rpmAt(t) : voice.rpm;
    const prev = phase;
    phase += f / rate;
    if (Math.floor(phase) !== Math.floor(prev)) cycleAmp = 0.8 + rand() * 0.25;
    const frac = phase % 1;
    // Firing pulse: a sharp knock that dies within the cycle.
    const pulse = Math.exp(-frac * 7) * cycleAmp;
    grit += 0.3 * (rand() - grit);
    const body = Math.sin(TAU * phase) * 0.35 + Math.sin(TAU * phase * 2) * 0.18;
    let x = pulse * (0.65 + 0.5 * grit) + body;
    // Every other cycle a little weaker: the uneven lope of a big diesel.
    if (Math.floor(phase) % 2) x *= 0.86;
    lp1 += k * (x - lp1);
    lp2 += k * (lp1 - lp2);
    const swell = 0.9 + 0.1 * Math.sin((TAU * t) / seconds);
    out[i]! += Math.tanh(lp2 * 1.6) * 0.6 * swell * (gainAt ? gainAt(t) : 1);
  }
}

/** Adds a machine layer; `amount` scales it (one-shots use it louder). */
function layerInto(
  out: Float32Array,
  length: number,
  rate: number,
  layer: MachineVoice['layer'],
  rand: () => number,
  seconds: number,
  amount: number,
) {
  const period = (t: number) => (t % seconds) / seconds;
  const bp = svf(1400, 6, rate);
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const p = period(t);
    let v = 0;
    switch (layer) {
      case 'hydraulics': {
        // Pump whine that rises as the boom works, plus oil hiss.
        const work = 0.5 - 0.5 * Math.cos(TAU * p);
        const whine = Math.sin(TAU * (380 + 90 * work) * t) * 0.05 * work;
        const [, band] = bp.run(rand());
        v = whine + band * 0.12 * work;
        break;
      }
      case 'winch': {
        const run = p > 0.15 && p < 0.85 ? Math.sin(Math.PI * ((p - 0.15) / 0.7)) : 0;
        const motor =
          (Math.abs(((t * 150) % 1) * 2 - 1) * 2 - 1) * 0.06 + Math.sin(TAU * 300 * t) * 0.03;
        const clickT = (t * 14) % 1;
        const click = Math.exp(-clickT * 60) * rand() * 0.08;
        v = (motor + click) * run;
        break;
      }
      case 'beeper': {
        const on = t % 1 < 0.45 ? 1 : 0;
        v = Math.sign(Math.sin(TAU * 1050 * t)) * 0.035 * on;
        break;
      }
      case 'vibro': {
        const am = 0.5 + 0.5 * Math.sin(TAU * 42 * t);
        const [, band] = bp.run(rand());
        v = Math.sin(TAU * 42 * t) * 0.18 * am + band * 0.05 * am;
        break;
      }
      case 'airbrake': {
        // A soft pneumatic hiss once per loop.
        const tt = (t % seconds) - seconds * 0.6;
        if (tt > 0 && tt < 0.8) {
          const [, , high] = bp.run(rand());
          v = high * 0.12 * Math.exp(-tt * 4) * Math.min(1, tt * 60);
        }
        break;
      }
      case 'hammer': {
        // Hydraulic breaker: ~9 hits a second for 40 % of the loop.
        if (p < 0.4) {
          const ht = (t * 9) % 1;
          const ring = Math.sin(TAU * 820 * ht) + 0.6 * Math.sin(TAU * 1310 * ht);
          v = (ring * 0.05 + rand() * 0.12) * Math.exp(-ht * 40);
        }
        break;
      }
      case 'track': {
        // Track links clattering over the sprocket, with a squeak now and then.
        const lt = (t * 5) % 1;
        const clank = (Math.sin(TAU * 700 * lt) + rand() * 0.6) * Math.exp(-lt * 45) * 0.06;
        const squeak = Math.sin(TAU * (1900 + 150 * Math.sin(TAU * 3 * t)) * t) * 0.012 * p;
        v = clank + (p > 0.6 ? squeak : 0);
        break;
      }
      default:
        v = 0;
    }
    out[i]! += v * amount;
  }
}

/** The arrival cue of a machine on screen: a rev plus its own layer, ~2 s. */
export function renderArrival(ctx: BaseAudioContext, type: MachineType): AudioBuffer {
  const voice = MACHINE_VOICES[type];
  return renderShot(ctx, 2.2, 1, (data, length, rate) => {
    const out = data[0]!;
    const rand = rng(type.length * 31 + 5);
    // Rev: the engine climbs to ~1.7× and settles.
    const rpmAt = (t: number) => voice.rpm * (1 + 0.7 * Math.sin(Math.PI * Math.min(1, t / 1.4)));
    const gainAt = (t: number) =>
      Math.min(1, t * 6) * (t > 1.6 ? Math.max(0, 1 - (t - 1.6) / 0.6) : 1);
    engineInto(out, length, rate, voice, rand, 2.2, rpmAt, gainAt);
    const layer = new Float32Array(length);
    layerInto(layer, length, rate, voice.layer === 'none' ? 'none' : voice.layer, rand, 2.2, 1.6);
    for (let i = 0; i < length; i++) out[i]! += layer[i]! * gainAt(i / rate);
  });
}

// ---- One-shot cues --------------------------------------------------------

export function renderClick(ctx: BaseAudioContext): AudioBuffer {
  const rand = rng(3);
  return renderShot(ctx, 0.05, 1, (data, length, rate) => {
    const out = data[0]!;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      out[i] = (Math.sin(TAU * 2300 * t) * 0.5 + rand() * 0.5) * Math.exp(-t * 260);
    }
  });
}

export function renderThunk(ctx: BaseAudioContext, slap = false): AudioBuffer {
  const rand = rng(slap ? 17 : 13);
  return renderShot(ctx, slap ? 0.5 : 0.3, 1, (data, length, rate) => {
    const out = data[0]!;
    let phase = 0;
    const bp = svf(1600, 1.5, rate);
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const f = 45 + 75 * Math.exp(-t * 30);
      phase += f / rate;
      let v = Math.sin(TAU * phase) * Math.exp(-t * (slap ? 9 : 14));
      // Latch / paper slap at the attack.
      const [, band] = bp.run(rand());
      v += band * Math.exp(-t * (slap ? 50 : 90)) * (slap ? 1.4 : 0.6);
      out[i] = Math.tanh(v * 1.3);
    }
  });
}

export function renderWhoosh(ctx: BaseAudioContext): AudioBuffer {
  const rand = rng(23);
  return renderShot(ctx, 0.9, 2, (data, length, rate) => {
    const [L, R] = data as [Float32Array, Float32Array];
    const f = svf(400, 2.5, rate);
    for (let i = 0; i < length; i++) {
      const p = i / length;
      const cutoff = 300 + 2400 * Math.sin(Math.PI * Math.pow(p, 0.8));
      const [, band] = f.run(rand(), f.set(cutoff));
      const env = Math.sin(Math.PI * Math.pow(p, 0.6)) ** 2;
      const v = band * env;
      L[i] = v * (1 - p * 0.6);
      R[i] = v * (0.4 + p * 0.6);
    }
  });
}

/** Brass hit + sub boom for the intro partner card. */
export function renderBoom(ctx: BaseAudioContext): AudioBuffer {
  const rand = rng(29);
  return renderShot(ctx, 2.8, 2, (data, length, rate) => {
    const [L, R] = data as [Float32Array, Float32Array];
    const notes = [38, 45, 50, 53, 57].map(NOTE);
    const lp = [0, 0];
    let sub = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      // Brass: saw stack whose filter opens fast and closes slowly.
      const cutoff = 200 + 2600 * Math.exp(-t * 3) * Math.min(1, t * 30);
      const k = lpK(cutoff, rate);
      let bl = 0;
      let br = 0;
      notes.forEach((f, n) => {
        bl += ((t * f * 1.003) % 1) * 2 - 1;
        br += ((t * f * (0.997 + n * 0.0004)) % 1) * 2 - 1;
      });
      lp[0]! += k * (bl - lp[0]!);
      lp[1]! += k * (br - lp[1]!);
      const env = Math.min(1, t * 40) * Math.exp(-t * 1.1);
      sub += (55 * Math.exp(-t * 2) + 28) / rate;
      const boom = Math.sin(TAU * sub) * Math.exp(-t * 1.6) * 0.9;
      const hit = rand() * Math.exp(-t * 30) * 0.4;
      L[i] = lp[0]! * 0.12 * env + boom + hit;
      R[i] = lp[1]! * 0.12 * env + boom + hit;
    }
  });
}

/** Starter motor cranking, then the diesel catches and settles. */
export function renderStart(ctx: BaseAudioContext, type: MachineType = 'backhoe'): AudioBuffer {
  const voice = MACHINE_VOICES[type];
  const rand = rng(41);
  return renderShot(ctx, 2, 1, (data, length, rate) => {
    const out = data[0]!;
    for (let i = 0; i < Math.min(length, 0.75 * rate); i++) {
      const t = i / rate;
      const crank = 0.55 + 0.45 * Math.sin(TAU * 7 * t);
      const whine = ((t * (170 + 30 * t)) % 1) * 2 - 1;
      out[i] = (whine * 0.25 + rand() * 0.15) * crank * Math.min(1, t * 20);
    }
    const catchAt = 0.6;
    const rpmAt = (t: number) => voice.rpm * (1 + 1.2 * Math.exp(-Math.max(0, t - catchAt) * 2.5));
    const gainAt = (t: number) =>
      t < catchAt ? 0 : Math.min(1, (t - catchAt) * 8) * (t > 1.5 ? Math.max(0, (2 - t) / 0.5) : 1);
    engineInto(out, length, rate, voice, rand, 2, rpmAt, gainAt);
  });
}

/** Walkie-talkie squelch before a foreman's line. */
export function renderSquelch(ctx: BaseAudioContext): AudioBuffer {
  const rand = rng(53);
  return renderShot(ctx, 0.22, 1, (data, length, rate) => {
    const out = data[0]!;
    const f = svf(1900, 3, rate);
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const [, band] = f.run(rand());
      out[i] = band * (t < 0.16 ? 1 : Math.max(0, 1 - (t - 0.16) / 0.06));
    }
  });
}

/** TV-style censor beep: a quiet 1 kHz tone, ~0.38 s. */
export function renderBeep(ctx: BaseAudioContext): AudioBuffer {
  return renderShot(
    ctx,
    0.38,
    1,
    (data, length, rate) => {
      const out = data[0]!;
      for (let i = 0; i < length; i++) out[i] = Math.sin((TAU * 1000 * i) / rate);
    },
    0.6,
  );
}

/** Walkie-talkie hiss: noise band-limited to ~300–3000 Hz, a 1 s loop. */
export function renderHiss(ctx: BaseAudioContext): AudioBuffer {
  const rand = rng(67);
  return renderLoop(ctx, 1, 1, BED_RATE, (data, length) => {
    const out = data[0]!;
    const f = svf(1200, 0.7, BED_RATE);
    for (let i = 0; i < length; i++) {
      const [, band] = f.run(rand());
      out[i] = Math.tanh(band * 3);
    }
  });
}

/** Impulse response of a big open yard, for the reverb send. */
export function renderImpulse(ctx: BaseAudioContext): AudioBuffer {
  const rand = rng(61);
  const rate = ctx.sampleRate;
  const length = Math.round(2.4 * rate);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const ch = buffer.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      lp += 0.35 * (rand() - lp);
      ch[i] = lp * Math.exp(-t * 2.6) * (t < 0.012 ? t / 0.012 : 1);
    }
  }
  return buffer;
}

/** Sparse one-shots of a busy site, played at random far back in the mix. */
export type SiteEvent = 'hammer' | 'grinder' | 'reverse' | 'clank' | 'horn';
export const SITE_EVENTS: SiteEvent[] = ['hammer', 'grinder', 'reverse', 'clank', 'horn'];

export function renderSiteEvent(ctx: BaseAudioContext, kind: SiteEvent): AudioBuffer {
  const rand = rng(kind.length * 31 + 7);
  if (kind === 'hammer') {
    // Three or four blows on steel: a ringing ping over a dull thud.
    return renderShot(ctx, 2.2, 1, (data, length, rate) => {
      const out = data[0]!;
      const blows = [0, 0.55, 1.1, 1.6];
      for (const at of blows) {
        const start = Math.round(at * rate);
        for (let i = start; i < length; i++) {
          const t = (i - start) / rate;
          if (t > 0.5) break;
          const ping =
            (Math.sin(TAU * 2350 * t) + 0.6 * Math.sin(TAU * 3720 * t)) * Math.exp(-t * 18);
          const thud = Math.sin(TAU * (90 + 60 * Math.exp(-t * 40)) * t) * Math.exp(-t * 30);
          out[i] = out[i]! + 0.45 * ping + 0.7 * thud + (rand() - 0.5) * Math.exp(-t * 120);
        }
      }
    });
  }
  if (kind === 'grinder') {
    // An angle grinder: a whining band of noise that bites in and lets go.
    return renderShot(ctx, 2.6, 1, (data, length, rate) => {
      const out = data[0]!;
      const bp = svf(3000, 6, rate);
      let phase = 0;
      for (let i = 0; i < length; i++) {
        const p = i / length;
        const env = Math.min(1, p * 8) * Math.min(1, (1 - p) * 5);
        const bite = 1 - 0.25 * Math.sin(Math.PI * Math.min(1, Math.max(0, (p - 0.3) / 0.4)));
        const [, band] = bp.run(rand() - 0.5, bp.set(3200 * bite));
        phase += (5200 * bite) / rate;
        out[i] = (band * 1.6 + 0.12 * Math.sin(TAU * phase)) * env;
      }
    });
  }
  if (kind === 'reverse') {
    // A truck reversing: five beeps of the back-up alarm.
    return renderShot(ctx, 4.8, 1, (data, length, rate) => {
      const out = data[0]!;
      for (let i = 0; i < length; i++) {
        const t = i / rate;
        const on = t % 0.95 < 0.48 && t < 4.75;
        out[i] = on ? Math.sin(TAU * 1100 * t) * 0.5 : 0;
      }
    });
  }
  if (kind === 'clank') {
    // Rebar or a sling hook dropped on steel: inharmonic partials.
    return renderShot(ctx, 1.6, 1, (data, length, rate) => {
      const out = data[0]!;
      const partials = [523, 1187, 1973, 2741, 3911];
      for (let i = 0; i < length; i++) {
        const t = i / rate;
        let v = 0;
        partials.forEach((f, k) => (v += Math.sin(TAU * f * t) * Math.exp(-t * (4 + k * 3))));
        out[i] = v * 0.3 + (rand() - 0.5) * Math.exp(-t * 80);
      }
    });
  }
  // A distant truck horn, two short blasts.
  return renderShot(ctx, 1.4, 1, (data, length, rate) => {
    const out = data[0]!;
    const lp = svf(900, 0.8, rate);
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const on = t < 0.35 || (t > 0.55 && t < 1.2) ? 1 : 0;
      const saw = ((t * 233) % 1) * 2 - 1 + (((t * 311) % 1) * 2 - 1) * 0.7;
      const [low] = lp.run(saw * on);
      out[i] = low;
    }
  });
}
