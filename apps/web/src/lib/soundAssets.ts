// Recordings used by the cinematic sound layer (files in /public/audio, each
// as Opus .webm plus an .mp3 fallback, mono). Everything else — the music,
// the site ambience, the diesel engines and machine layers, clicks, thunks,
// whooshes, the brass hit, the radio — is synthesized in the browser
// (soundSynth.ts). Every file here is free for commercial use; the credits
// page lists them from SOUND_CREDITS.
//
// To add a recording: put <name>.webm and <name>.mp3 into /public/audio, add
// the name below, map it in SITE_SAMPLES or MACHINE_SAMPLES and credit it.

import type { MachineType } from '@/lib/machinePhotos';

export type SampleName = 'diesel';

/** Looped under the music as extra construction-site ambience. */
export const SITE_SAMPLES: { name: SampleName; gain: number; pan: number }[] = [];

/** Played once on top of the synthesized engine when the machine appears. */
export const MACHINE_SAMPLES: Partial<
  Record<MachineType, { name: SampleName; gain: number; pan?: number }>
> = {
  truck: { name: 'diesel', gain: 0.5 },
  tractor: { name: 'diesel', gain: 0.35 },
  dozer: { name: 'diesel', gain: 0.3, pan: 0.2 },
};

export type SoundCredit = {
  name: SampleName;
  title: string;
  author: string;
  license: string;
  url: string;
  use: string;
};

export const SOUND_CREDITS: SoundCredit[] = [
  {
    name: 'diesel',
    title: 'Detroit62.ogg',
    author: 'Sixthstar',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:Detroit62.ogg',
    use: 'дизель самосвала, трактора и бульдозера',
  },
];
