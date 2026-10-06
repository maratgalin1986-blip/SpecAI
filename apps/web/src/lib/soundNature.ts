// Nature around the 3D site (owner, 2026-10-03): recordings from Mixkit
// (free licence, see SOUND_CREDITS) mixed by the real weather — light or
// heavy rain, wind by its speed, birds by day when it is dry, the town by day
// and by night — plus chirps, a crow, dogs and cats now and then, thunder
// after a lightning flash, and footsteps on snow, mud or gravel while the
// visitor walks. Loops load only when the weather first calls for them.

import type { Ground, NatureEventDetail } from '@/lib/sceneEvents';
import type { SampleName } from '@/lib/soundAssets';

type Loop = { src: AudioBufferSourceNode; gain: GainNode; name: SampleName };

const LOOPS = ['rain-light', 'rain-heavy', 'wind', 'birds', 'city-day', 'city-night'] as const;
type LoopName = (typeof LOOPS)[number];

const STEP_LOOP: Record<Ground, SampleName> = {
  snow: 'step-snow',
  wet: 'step-mud',
  dry: 'step-gravel',
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** How loud each loop should be for this weather (0…1, before the bus level). */
export function natureMix(s: NatureEventDetail): Record<LoopName, number> {
  const heavy = smooth(0.45, 0.85, s.rain);
  const day = 1 - s.night;
  const dry = 1 - clamp01(s.rain * 3);
  return {
    'rain-light': s.rain > 0.03 ? clamp01(s.rain * 1.8) * (1 - heavy) * 0.75 : 0,
    'rain-heavy': heavy * 0.85,
    wind: clamp01((s.wind - 3) / 9) * 0.6,
    birds: day * dry * (1 - s.snow * 0.6) * 0.5,
    'city-day': day * 0.22,
    'city-night': s.night * 0.32,
  };
}

/** Which one-shot to play now, or null (random, by the weather). */
export function natureEvent(s: NatureEventDetail, r = Math.random()): SampleName | null {
  const day = s.night < 0.5;
  const dryDay = day && s.rain < 0.3;
  const table: [SampleName, number][] = [
    ['chirp-1', dryDay ? 0.16 : 0],
    ['chirp-2', dryDay ? 0.12 : 0],
    ['chirp-3', dryDay ? 0.12 : 0],
    ['crow', day ? 0.1 : 0.02],
    ['dog-1', day ? 0.07 : 0.12],
    ['dog-2', day ? 0.05 : 0.1],
    ['dog-3', day ? 0.03 : 0.07],
    ['cat-1', day ? 0.03 : 0.07],
    ['cat-2', day ? 0.02 : 0.05],
  ];
  let acc = 0;
  for (const [name, p] of table) {
    acc += p;
    if (r < acc) return name;
  }
  return null;
}

export class NatureLayer {
  private loops = new Map<LoopName, Loop>();
  private loading = new Set<LoopName>();
  private state: NatureEventDetail | null = null;
  private timer = 0;
  private steps: Loop | null = null;
  private stepsWanted: { moving: boolean; ground: Ground } = { moving: false, ground: 'dry' };
  private splashAt = 0;
  private token = 0;

  constructor(
    private ctx: AudioContext,
    private bus: AudioNode,
    private load: (name: SampleName) => Promise<AudioBuffer | null>,
    private oneShot: (buffer: AudioBuffer | null, gain: number, pan: number, rate: number) => void,
  ) {}

  set(state: NatureEventDetail | null) {
    this.state = state;
    if (!state) {
      for (const name of LOOPS) this.level(name, 0);
      window.clearTimeout(this.timer);
      this.timer = 0;
      this.setSteps(false, 'dry');
      return;
    }
    const mix = natureMix(state);
    for (const name of LOOPS) this.level(name, mix[name]);
    if (!this.timer) this.schedule();
  }

  /** Thunder a moment after the flash, like a storm a few kilometres away. */
  thunder() {
    if (!this.state) return;
    void this.load('thunder').then((buffer) =>
      window.setTimeout(
        () => this.oneShot(buffer, 0.8, (Math.random() - 0.5) * 0.8, 0.9 + Math.random() * 0.2),
        600 + Math.random() * 1800,
      ),
    );
  }

  setSteps(moving: boolean, ground: Ground) {
    this.stepsWanted = { moving, ground };
    const want = moving && this.state ? STEP_LOOP[ground] : null;
    const now = this.ctx.currentTime;
    if (this.steps && this.steps.name !== want) {
      const old = this.steps;
      this.steps = null;
      old.gain.gain.setTargetAtTime(0, now, 0.12);
      window.setTimeout(() => stopLoop(old), 600);
    }
    if (!want || this.steps) return;
    const token = ++this.token;
    void this.load(want).then((buffer) => {
      const wanted = this.stepsWanted;
      if (!buffer || token !== this.token || !wanted.moving) return;
      if (STEP_LOOP[wanted.ground] !== want) return;
      this.steps = this.startLoop(buffer, want, 0.42);
    });
  }

  dispose() {
    window.clearTimeout(this.timer);
    for (const loop of this.loops.values()) stopLoop(loop);
    this.loops.clear();
    if (this.steps) stopLoop(this.steps);
    this.steps = null;
  }

  private level(name: LoopName, value: number) {
    const loop = this.loops.get(name);
    const now = this.ctx.currentTime;
    if (loop) {
      loop.gain.gain.setTargetAtTime(value, now, 1.5);
      return;
    }
    if (value < 0.01 || this.loading.has(name)) return;
    this.loading.add(name);
    void this.load(name).then((buffer) => {
      this.loading.delete(name);
      if (!buffer || this.loops.has(name) || !this.state) return;
      const target = natureMix(this.state)[name];
      if (target < 0.01) return;
      const loop = this.startLoop(buffer, name, 0, Math.random() * buffer.duration);
      loop.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 1.5);
      this.loops.set(name, loop);
    });
  }

  private startLoop(buffer: AudioBuffer, name: SampleName, gain: number, offset = 0): Loop {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(this.bus);
    src.start(this.ctx.currentTime, offset % buffer.duration);
    return { src, gain: g, name };
  }

  private schedule() {
    this.timer = window.setTimeout(
      async () => {
        const s = this.state;
        if (!s) {
          this.timer = 0;
          return;
        }
        const name = natureEvent(s);
        if (name && document.visibilityState === 'visible') {
          const buffer = await this.load(name);
          this.oneShot(
            buffer,
            0.25 + Math.random() * 0.25,
            (Math.random() - 0.5) * 1.6,
            0.94 + Math.random() * 0.12,
          );
        }
        // A splash now and then when walking through puddles.
        const w = this.stepsWanted;
        if (w.moving && w.ground === 'wet' && performance.now() > this.splashAt) {
          this.splashAt = performance.now() + 2500 + Math.random() * 3000;
          this.oneShot(await this.load('step-puddle'), 0.35, 0, 0.95 + Math.random() * 0.1);
        }
        this.schedule();
      },
      2500 + Math.random() * 5500,
    );
  }
}

function stopLoop(loop: Loop) {
  try {
    loop.src.stop();
  } catch {
    /* already stopped */
  }
  loop.src.disconnect();
  loop.gain.disconnect();
}
