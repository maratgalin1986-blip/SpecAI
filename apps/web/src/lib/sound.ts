// Cinematic sound layer: the shared state and the tiny API the components use
// to announce what is on screen. No audio code here: the engine
// (soundEngine.ts) is loaded only after the visitor turns sound on, and
// SoundDirector connects the two.

import type { MachineType } from '@/lib/machinePhotos';

/** One-shot cues the components may ask for. */
export type SoundCue =
  | 'click' // a button press (not links: a page change gets the whoosh)
  | 'thunk' // «Позвонить», «Наряд», «Отправить»
  | 'whoosh' // page transition, curtain, push-in
  | 'boom' // intro partner card
  | 'start' // engine start (wizard: machine or job chosen)
  | 'stamp' // wizard: work order complete
  | 'chime'; // a quiet «done» (a stamp is followed by one)

/** Where a machine is announced from; the newest active source wins. */
export type MachineSource = 'hero' | 'journey' | 'page' | 'wizard' | 'scene';

// v2 (2026-10-03): the old switch took two presses, so many «off» choices
// saved under the old key were accidents; sound is on again for everyone.
export const SOUND_STORAGE_KEY = 'specplast16_sound_v2';
export const SOUND_HINT_KEY = 'specplast16_sound_hint';
/** The chat microphone opened (detail true) or closed: the site's sound steps aside. */
export const MIC_EVENT = 'specplast16:mic';
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
// The first client render already shows the right label (SoundToggle): the
// saved choice, before the director (a lazy chunk) arrives. Under reduced
// motion the director starts sound only from the switch, so it reads «off».
let enabled = typeof window !== 'undefined' && !prefersReducedMotion() && storedSoundChoice();

/** The director starts sound by itself only without this preference. */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Pages for reading (consent, policy, credits): no cinema layer and no sound
 * director, so no sound switch either (CinemaLayer, SoundToggle).
 */
export const DOCUMENT_PAGES = /^\/(soglasie|privacy|credits)(\/|$)/;

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

/**
 * The saved choice; sound is on unless the visitor turned it off (owner's
 * request, 2026-10-03). Browsers still start audio only at the first tap,
 * key or click of the page.
 */
export function storedSoundChoice(): boolean {
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

// ---- How loud each machine is ---------------------------------------------

/**
 * Loudness of each machine's idle loop, 0…1 (the recordings are in
 * soundAssets.ts: MACHINE_SOUNDS). Big diesels a little louder than the
 * truck-mounted cranes and the aerial platform.
 */
export const MACHINE_LEVELS: Record<MachineType, number> = {
  backhoe: 0.8,
  excavator: 0.9,
  'wheeled-excavator': 0.85,
  crane: 0.8,
  kmu: 0.75,
  loader: 0.85,
  truck: 0.85,
  dozer: 0.95,
  agp: 0.7,
  roller: 0.85,
  tractor: 0.75,
  trench: 0.6,
};
