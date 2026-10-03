// Window events for a sound layer (or analytics) to follow the /stroyka scene.
//   sp:scene  { machine, active }  — a zone with this machine became active / inactive
//   sp:dialog { speaker, text, kind } — a character line starts; speaker is
//             'mihalych' | 'rinat' | 'sveta' | 'ildar' | 'alsu' | 'worker' (one voice each) or
//             'dog' (the site dog: not spoken), kind 'business' | 'joke' | 'radio' (adds
//             static), mood from lib/stroyka/mood.ts. Comic «swear» runs (#@%&$*!) stay in
//             the text for the sound layer to bleep; emojis stay too and must be stripped
//             (stripEmoji) before anything is spoken.
import type { MachineType } from '@/lib/machinePhotos';
import type { Mood } from '@/lib/stroyka/mood';
import type { BanterSpeaker } from '@/lib/stroykaJokes';

export const SCENE_EVENT = 'sp:scene';
export const DIALOG_EVENT = 'sp:dialog';

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
