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

export type SampleName =
  | 'diesel'
  // Nature on the 3D site (soundNature.ts).
  | 'rain-light'
  | 'rain-heavy'
  | 'thunder'
  | 'wind'
  | 'birds'
  | 'city-day'
  | 'city-night'
  | 'chirp-1'
  | 'chirp-2'
  | 'chirp-3'
  | 'crow'
  | 'dog-1'
  | 'dog-2'
  | 'dog-3'
  | 'cat-1'
  | 'cat-2'
  | 'step-snow'
  | 'step-mud'
  | 'step-puddle'
  | 'step-gravel';

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
  {
    name: 'rain-light',
    title: 'Light rain loop',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: дождь',
  },
  {
    name: 'rain-heavy',
    title: 'Heavy storm rain loop',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: ливень',
  },
  {
    name: 'thunder',
    title: 'Thunder strike in storm',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: гром',
  },
  {
    name: 'wind',
    title: 'Wind blowing ambience',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: ветер',
  },
  {
    name: 'birds',
    title: 'Morning sound in a garden',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: птицы днём',
  },
  {
    name: 'city-day',
    title: 'Urban ambience during the day',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: город днём',
  },
  {
    name: 'city-night',
    title: 'Urban city ambience at night',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: город ночью',
  },
  {
    name: 'chirp-1',
    title: 'Little bird calling chirp',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: чириканье',
  },
  {
    name: 'chirp-2',
    title: 'Double little bird chirp',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: чириканье',
  },
  {
    name: 'chirp-3',
    title: 'Melodic songbird chirp',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: птица',
  },
  {
    name: 'crow',
    title: 'Wild raven bird calling',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: ворона',
  },
  {
    name: 'dog-1',
    title: 'Dog barking twice',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: лай собаки',
  },
  {
    name: 'dog-2',
    title: 'Medium size angry dog bark',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: лай собаки',
  },
  {
    name: 'dog-3',
    title: 'Annoyed big dog barking',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: лай собаки',
  },
  {
    name: 'cat-1',
    title: 'Domestic cat hungry meow',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: кошка',
  },
  {
    name: 'cat-2',
    title: 'Little cat attention meow',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: кошка',
  },
  {
    name: 'step-snow',
    title: 'Footsteps on the snow',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: шаги по снегу',
  },
  {
    name: 'step-mud',
    title: 'Footsteps in deep mud',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: шаги по грязи',
  },
  {
    name: 'step-puddle',
    title: 'Footsteps in a muddy puddle',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: шаг в лужу',
  },
  {
    name: 'step-gravel',
    title: 'Crunchy road fast walking loop',
    author: 'Mixkit',
    license: 'Mixkit Sound Effects Free License',
    url: 'https://mixkit.co/free-sound-effects/',
    use: 'стройка: шаги по щебню',
  },
];
