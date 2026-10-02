// Window events for a sound layer (or analytics) to follow the /stroyka scene.
//   sp:scene  { machine, active }  — a zone with this machine became active / inactive
//   sp:dialog { speaker, text, kind } — a character line starts; speaker is
//             'mihalych' | 'rinat' | 'sveta' | 'ildar' | 'worker' (one voice each),
//             kind 'business' | 'joke' | 'radio' (adds static). Comic «swear» runs (#@%&$*!) stay in
//             the text for the sound layer to bleep.
import type { MachineType } from '@/lib/machinePhotos';
import type { BanterSpeaker } from '@/lib/stroykaJokes';

export const SCENE_EVENT = 'sp:scene';
export const DIALOG_EVENT = 'sp:dialog';

export interface SceneEventDetail {
  machine: MachineType;
  active: boolean;
}
export interface DialogEventDetail {
  speaker: BanterSpeaker;
  text: string;
  kind: 'business' | 'joke' | 'radio';
}

function emit<T>(name: string, detail: T) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<T>(name, { detail }));
}

export function emitScene(machine: MachineType, active: boolean) {
  emit<SceneEventDetail>(SCENE_EVENT, { machine, active });
}

export function emitDialog(
  speaker: BanterSpeaker,
  text: string,
  kind: 'business' | 'joke' | 'radio',
) {
  emit<DialogEventDetail>(DIALOG_EVENT, { speaker, text, kind });
}
