// Window events for a sound layer (or analytics) to follow the /stroyka scene.
//   sp:scene  { machine, active }  — a zone with this machine became active / inactive
//   sp:dialog { speaker, text, kind } — a character line starts; speaker is
//             'mihalych' | 'rinat' | 'sveta' | 'ildar' | 'alsu' | 'worker' (one voice each) or
//             'dog' (the site dog: not spoken), kind 'business' | 'joke' | 'radio' (adds
//             static), mood from lib/stroyka/mood.ts. Comic «swear» runs (#@%&$*!) stay in
//             the text for the sound layer to bleep; emojis stay too and must be stripped
//             (stripEmoji) before anything is spoken.
//   sp:nature { rain, snow, wind, night, ground } or null — the weather around the
//             visitor (null when the scene closes): rain and snow 0…1, wind m/s,
//             night 0…1, ground 'dry' | 'wet' | 'snow'.
//   sp:steps  { moving, ground } — the visitor walks (or stops) on that ground.
//   sp:thunder {} — a lightning flash: the thunder follows.
//   (Nothing sends sp:steps or sp:thunder since the 3D world went, 2026-10-06.)
import type { MachineType } from '@/lib/machinePhotos';
import type { Mood } from '@/lib/stroyka/mood';
import type { BanterSpeaker } from '@/lib/stroykaJokes';

export const SCENE_EVENT = 'sp:scene';
export const DIALOG_EVENT = 'sp:dialog';
export const NATURE_EVENT = 'sp:nature';
export const STEPS_EVENT = 'sp:steps';
export const THUNDER_EVENT = 'sp:thunder';

export type Ground = 'dry' | 'wet' | 'snow';
export interface NatureEventDetail {
  rain: number;
  snow: number;
  wind: number;
  night: number;
  ground: Ground;
}
export interface StepsEventDetail {
  moving: boolean;
  ground: Ground;
}

export interface SceneEventDetail {
  machine: MachineType;
  active: boolean;
}
export interface DialogEventDetail {
  speaker: BanterSpeaker | 'dog';
  text: string;
  kind: 'business' | 'joke' | 'radio';
  mood?: Mood;
}

function emit<T>(name: string, detail: T) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<T>(name, { detail }));
}

export function emitScene(machine: MachineType, active: boolean) {
  emit<SceneEventDetail>(SCENE_EVENT, { machine, active });
}

export function emitDialog(
  speaker: BanterSpeaker | 'dog',
  text: string,
  kind: 'business' | 'joke' | 'radio',
  mood?: Mood,
) {
  emit<DialogEventDetail>(DIALOG_EVENT, { speaker, text, kind, ...(mood ? { mood } : {}) });
}

// The latest weather, kept like announcedMachines() in lib/sound.ts: the page
// may emit it before the sound layer (a lazy chunk) listens.
let lastNature: NatureEventDetail | null = null;

/** The weather last sent with emitNature (null: no scene, or it closed). */
export function currentNature(): NatureEventDetail | null {
  return lastNature;
}

export function emitNature(detail: NatureEventDetail | null) {
  lastNature = detail;
  emit<NatureEventDetail | null>(NATURE_EVENT, detail);
}
