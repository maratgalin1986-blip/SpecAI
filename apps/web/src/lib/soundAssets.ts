// Recordings used by the cinematic sound layer (files in /public/audio, each
// as Opus .webm plus an .mp3 fallback, mono). Everything else — the music,
// the diesel engines, clicks, thunks, whooshes, the brass hit — is
// synthesized in the browser (soundSynth.ts). Every file here is free for
// commercial use; the credits page lists them from SOUND_CREDITS.

import type { MachineType } from '@/lib/machinePhotos';

export type SampleName =
  | 'site-construction'
  | 'site-crusher'
  | 'excavator-gravel'
  | 'backup-beeper'
  | 'crane-winch'
  | 'breaker'
  | 'engine-start'
  | 'diesel'
  | 'dozer';

/** Looped under the music as the construction-site ambience. */
export const SITE_SAMPLES: { name: SampleName; gain: number; pan: number }[] = [
  { name: 'site-construction', gain: 0.9, pan: 0 },
  { name: 'site-crusher', gain: 0.25, pan: 0.5 },
];

/** Played once on top of the synthesized engine when the machine appears. */
export const MACHINE_SAMPLES: Partial<
  Record<MachineType, { name: SampleName; gain: number; pan?: number }>
> = {
  backhoe: { name: 'excavator-gravel', gain: 0.55 },
  excavator: { name: 'excavator-gravel', gain: 0.7 },
  'wheeled-excavator': { name: 'breaker', gain: 0.45 },
  crane: { name: 'crane-winch', gain: 0.7 },
  kmu: { name: 'crane-winch', gain: 0.55 },
  loader: { name: 'backup-beeper', gain: 0.25, pan: -0.3 },
  truck: { name: 'diesel', gain: 0.5 },
  tractor: { name: 'diesel', gain: 0.35 },
  dozer: { name: 'dozer', gain: 0.75 },
  trench: { name: 'backup-beeper', gain: 0.15, pan: 0.4 },
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
    name: 'site-construction',
    title: 'Construction.ogg',
    author: 'Dsw4',
    license: 'Public domain',
    url: 'https://commons.wikimedia.org/wiki/File:Construction.ogg',
    use: 'фон стройки',
  },
  {
    name: 'site-crusher',
    title: 'Kleemann crushing plant Koskela depot.opus',
    author: 'Antti Leppänen',
    license: 'CC BY 4.0',
    url: 'https://commons.wikimedia.org/wiki/File:Kleemann_crushing_plant_Koskela_depot.opus',
    use: 'далёкая техника на фоне',
  },
  {
    name: 'excavator-gravel',
    title: 'A small orange excavator shoveling gravel.ogg',
    author: 'T.Voekler',
    license: 'CC BY-SA 3.0',
    url: 'https://commons.wikimedia.org/wiki/File:A_small_orange_excavator_shoveling_gravel.ogg',
    use: 'экскаваторы',
  },
  {
    name: 'backup-beeper',
    title: 'Back-up beeper.ogg',
    author: 'Ke4roh',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:Back-up_beeper.ogg',
    use: 'сигнал заднего хода',
  },
  {
    name: 'crane-winch',
    title: 'WWS Coalcrane.ogg',
    author: 'Work With Sounds / Konrad Gutkowski',
    license: 'CC BY 4.0',
    url: 'https://commons.wikimedia.org/wiki/File:WWS_Coalcrane.ogg',
    use: 'лебёдка крана и манипулятора',
  },
  {
    name: 'breaker',
    title: 'WWS PneumatichammerZ300.ogg',
    author: 'Work With Sounds / Technical Museum of Slovenia',
    license: 'CC BY 4.0',
    url: 'https://commons.wikimedia.org/wiki/File:WWS_PneumatichammerZ300.ogg',
    use: 'гидромолот',
  },
  {
    name: 'engine-start',
    title: 'Merced The Bus Gillig engine start.ogg',
    author: 'Evan0512',
    license: 'CC BY-SA 4.0',
    url: 'https://commons.wikimedia.org/wiki/File:Merced_The_Bus_Gillig_engine_start.ogg',
    use: 'запуск дизеля, самосвал',
  },
  {
    name: 'diesel',
    title: 'Detroit62.ogg',
    author: 'Sixthstar',
    license: 'CC0',
    url: 'https://commons.wikimedia.org/wiki/File:Detroit62.ogg',
    use: 'дизель самосвала и трактора',
  },
  {
    name: 'dozer',
    title: 'Berg zand verplaatsen door een bulldozer (Beeld en Geluid)',
    author: 'Beeld en Geluid',
    license: 'CC BY-SA 3.0',
    url: 'https://commons.wikimedia.org/wiki/File:Berg_zand_verplaatsen_door_een_bulldozer_-_SoundCloud_-_Beeld_en_Geluid.ogg',
    use: 'бульдозер',
  },
];
