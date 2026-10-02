// Cinematic sound layer: the shared state and the tiny API the components use
// to announce what is on screen. No audio code here: the engine
// (soundEngine.ts) is loaded only after the visitor turns sound on, and
// SoundDirector connects the two.

import type { MachineType } from '@/lib/machinePhotos';

/** One-shot cues the components may ask for. */
export type SoundCue =
  | 'click' // any button press
  | 'thunk' // «Позвонить», «Наряд», «Отправить»
  | 'whoosh' // page transition, curtain, push-in
  | 'boom' // intro partner card
  | 'start' // engine start (wizard: machine or job chosen)
  | 'stamp'; // wizard: work order complete

/** Where a machine is announced from; the newest active source wins. */
export type MachineSource = 'hero' | 'journey' | 'page' | 'wizard' | 'scene';

export const SOUND_STORAGE_KEY = 'specplast16_sound';
export const SOUND_HINT_KEY = 'specplast16_sound_hint';
const CUE_EVENT = 'specplast16:sound-cue';
const MACHINE_EVENT = 'specplast16:sound-machine';

export type CueDetail = { cue: SoundCue; machine?: MachineType | null };
export type MachineDetail = { source: MachineSource; type: MachineType | null };

/** Plays a one-shot cue if sound is on; a no-op otherwise. */
export function playCue(cue: SoundCue, machine?: MachineType | null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<CueDetail>(CUE_EVENT, { detail: { cue, machine } }));
}

// The latest announcement per source: a page may announce before the
// director's listener exists (child effects run first).
const announced = new Map<MachineSource, MachineType>();

/** What each source currently shows. */
export function announcedMachines(): ReadonlyMap<MachineSource, MachineType> {
  return announced;
}

/** Says which machine a part of the page shows now (`null`: nothing). */
export function announceMachine(source: MachineSource, type: MachineType | null): void {
  if (typeof window === 'undefined') return;
  if (type) announced.set(source, type);
  else announced.delete(source);
  window.dispatchEvent(new CustomEvent<MachineDetail>(MACHINE_EVENT, { detail: { source, type } }));
}

export function onCue(handler: (detail: CueDetail) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<CueDetail>).detail);
  window.addEventListener(CUE_EVENT, listener);
  return () => window.removeEventListener(CUE_EVENT, listener);
}

export function onMachine(handler: (detail: MachineDetail) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<MachineDetail>).detail);
  window.addEventListener(MACHINE_EVENT, listener);
  return () => window.removeEventListener(MACHINE_EVENT, listener);
}

// ---- On/off state shared by the header toggle and the director ----------

type Listener = () => void;
const listeners = new Set<Listener>();
let enabled = false;

export function soundEnabled(): boolean {
  return enabled;
}

export function subscribeSound(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Changes the state; `persist` saves the visitor's choice. */
export function setSoundEnabled(value: boolean, persist = true): void {
  if (persist) {
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, value ? 'on' : 'off');
    } catch {
      /* storage blocked: the choice lasts for this page only */
    }
  }
  if (enabled === value) return;
  enabled = value;
  listeners.forEach((listener) => listener());
}

/** The saved choice; sound is off unless the visitor turned it on. */
export function storedSoundChoice(): boolean {
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

// ---- Which sound each machine makes --------------------------------------

/** A machine's character: one diesel model tuned per machine, plus a layer. */
export type MachineVoice = {
  /** Idle firing rate of the diesel model, Hz. */
  rpm: number;
  /** Low-pass cutoff of the engine, Hz (bigger engines sound darker). */
  tone: number;
  /** Specific layer on top of the engine. */
  layer: 'hydraulics' | 'winch' | 'beeper' | 'vibro' | 'airbrake' | 'hammer' | 'track' | 'none';
  /** Loudness of the idle loop, 0…1. */
  level: number;
};

export const MACHINE_VOICES: Record<MachineType, MachineVoice> = {
  backhoe: { rpm: 30, tone: 700, layer: 'hydraulics', level: 0.8 },
  excavator: { rpm: 24, tone: 520, layer: 'track', level: 0.9 },
  'wheeled-excavator': { rpm: 27, tone: 620, layer: 'hammer', level: 0.85 },
  crane: { rpm: 26, tone: 560, layer: 'winch', level: 0.8 },
  kmu: { rpm: 32, tone: 760, layer: 'hydraulics', level: 0.75 },
  loader: { rpm: 28, tone: 600, layer: 'beeper', level: 0.85 },
  truck: { rpm: 25, tone: 480, layer: 'airbrake', level: 0.85 },
  dozer: { rpm: 22, tone: 450, layer: 'track', level: 0.95 },
  agp: { rpm: 34, tone: 820, layer: 'hydraulics', level: 0.7 },
  roller: { rpm: 29, tone: 540, layer: 'vibro', level: 0.85 },
  tractor: { rpm: 33, tone: 900, layer: 'none', level: 0.75 },
  trench: { rpm: 23, tone: 420, layer: 'beeper', level: 0.6 },
};
