// Recordings of the sound layer (files in /public/audio, each as Opus .webm
// plus an .mp3 fallback, mono). Since 2026-10-06 («звуки разные сделай
// по-людски») every sound of the site is a real recording from Mixkit, free
// for commercial use: the machines, the site ambience, the music, the
// interface cues and the walkie-talkie. Nothing is synthesized any more.
//
// Files are trimmed, loudness-normalised per kind (beds −24 LUFS, machines
// −22/−23, events −24…−26, cues by peak), loops crossfade their tail into
// their head. To add one: put <name>.webm and <name>.mp3 into /public/audio,
// add the name below, use it in a table and credit it in SOUND_CREDITS.

import type { MachineType } from '@/lib/machinePhotos';

/** Recordings of the film tour's nature layer (soundNature.ts). */
type NatureSample =
  | 'rain-light'
  | 'rain-heavy'
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
  | 'cat-2';

export type MachineIdle =
  | 'm-idle-truck'
  | 'm-idle-tractor'
  | 'm-idle-tracked'
  | 'm-idle-heavy'
  | 'm-idle-hydraulic'
  | 'm-idle-roller';

export type MachineArrival =
  | 'm-arrive-dirt-1'
  | 'm-arrive-dirt-2'
  | 'm-arrive-brake-1'
  | 'm-arrive-brake-2'
  | 'm-arrive-beeper-1'
  | 'm-arrive-beeper-2'
  | 'm-arrive-hydraulic-1'
  | 'm-arrive-hydraulic-2'
  | 'm-arrive-track-1'
  | 'm-arrive-track-2'
  | 'm-arrive-tractor-1'
  | 'm-arrive-tractor-2';

export type SampleName =
  | NatureSample
  | MachineIdle
  | MachineArrival
  | 'm-start-1'
  | 'm-start-2'
  | 'ev-hammer'
  | 'ev-wood'
  | 'ev-clank'
  | 'ev-shovel'
  | 'ev-debris'
  | 'ev-beeper'
  | 'bed-site-1'
  | 'bed-site-2'
  | 'bed-city'
  | 'music-bed'
  | 'ui-click-1'
  | 'ui-click-2'
  | 'ui-thunk-1'
  | 'ui-thunk-2'
  | 'ui-whoosh-1'
  | 'ui-whoosh-2'
  | 'ui-stamp-1'
  | 'ui-stamp-2'
  | 'ui-chime-1'
  | 'ui-chime-2'
  | 'ui-boom'
  | 'radio-squelch'
  | 'radio-hiss'
  | 'radio-beep';

/**
 * Each machine: its idle loop and two arrival variants (a random one plays
 * when the machine is announced). Similar machines share a recording; the
 * engine detunes it a little per machine (`rate`) so they do not sound alike.
 */
export const MACHINE_SOUNDS: Record<
  MachineType,
  { idle: MachineIdle; rate: number; arrive: [MachineArrival, MachineArrival] }
> = {
  backhoe: { idle: 'm-idle-tractor', rate: 1.04, arrive: ['m-arrive-dirt-1', 'm-arrive-dirt-2'] },
  excavator: { idle: 'm-idle-tracked', rate: 1, arrive: ['m-arrive-dirt-1', 'm-arrive-dirt-2'] },
  'wheeled-excavator': {
    idle: 'm-idle-heavy',
    rate: 1.03,
    arrive: ['m-arrive-dirt-2', 'm-arrive-dirt-1'],
  },
  crane: {
    idle: 'm-idle-heavy',
    rate: 0.96,
    arrive: ['m-arrive-hydraulic-1', 'm-arrive-hydraulic-2'],
  },
  kmu: {
    idle: 'm-idle-hydraulic',
    rate: 1,
    arrive: ['m-arrive-hydraulic-2', 'm-arrive-hydraulic-1'],
  },
  loader: {
    idle: 'm-idle-tractor',
    rate: 0.97,
    arrive: ['m-arrive-beeper-1', 'm-arrive-beeper-2'],
  },
  truck: { idle: 'm-idle-truck', rate: 1, arrive: ['m-arrive-brake-1', 'm-arrive-brake-2'] },
  dozer: { idle: 'm-idle-tracked', rate: 0.94, arrive: ['m-arrive-track-1', 'm-arrive-track-2'] },
  agp: {
    idle: 'm-idle-hydraulic',
    rate: 1.05,
    arrive: ['m-arrive-hydraulic-1', 'm-arrive-hydraulic-2'],
  },
  roller: { idle: 'm-idle-roller', rate: 1, arrive: ['m-arrive-tractor-2', 'm-arrive-track-2'] },
  tractor: {
    idle: 'm-idle-tractor',
    rate: 1.02,
    arrive: ['m-arrive-tractor-1', 'm-arrive-tractor-2'],
  },
  trench: { idle: 'm-idle-tracked', rate: 1.06, arrive: ['m-arrive-dirt-2', 'm-arrive-track-1'] },
};

/** One-shot cues: the variants of each (one is picked at random, never twice in a row). */
export const CUE_SAMPLES = {
  click: ['ui-click-1', 'ui-click-2'],
  thunk: ['ui-thunk-1', 'ui-thunk-2'],
  whoosh: ['ui-whoosh-1', 'ui-whoosh-2'],
  stamp: ['ui-stamp-1', 'ui-stamp-2'],
  chime: ['ui-chime-1', 'ui-chime-2'],
  boom: ['ui-boom'],
  start: ['m-start-1', 'm-start-2'],
} as const satisfies Record<string, readonly SampleName[]>;

/** Distant work somewhere on the site, every 9–18 s under the beds. */
export const SITE_EVENTS: { name: SampleName; gain: number }[] = [
  { name: 'ev-hammer', gain: 0.5 },
  { name: 'ev-wood', gain: 0.35 },
  { name: 'ev-clank', gain: 0.3 },
  { name: 'ev-shovel', gain: 0.55 },
  { name: 'ev-debris', gain: 0.45 },
  { name: 'ev-beeper', gain: 0.25 },
];

/** The site ambience: one of the two construction beds and the light town under it. */
export const SITE_BEDS: SampleName[] = ['bed-site-1', 'bed-site-2'];
export const CITY_BED: SampleName = 'bed-city';
export const MUSIC_BED: SampleName = 'music-bed';

export type SoundCredit = {
  name: SampleName;
  title: string;
  author: string;
  license: string;
  url: string;
  use: string;
};

const MIXKIT_SFX = 'Mixkit Sound Effects Free License';
const MIXKIT_MUSIC = 'Mixkit Stock Music Free License';

/** A Mixkit sound effect (or a mix of several), by its catalogue ids and titles. */
function mixkit(
  name: SampleName,
  sources: [number, string][],
  page: string,
  use: string,
): SoundCredit {
  return {
    name,
    title: sources.map(([id, title]) => `${title} (#${id})`).join(' + '),
    author: 'Mixkit',
    license: MIXKIT_SFX,
    url: `https://mixkit.co/free-sound-effects/${page}/`,
    use,
  };
}

export const SOUND_CREDITS: SoundCredit[] = [
  // Machines
  mixkit('m-idle-truck', [[1621, 'Truck driving steady']], 'truck', 'самосвал, КМУ: мотор'),
  mixkit(
    'm-idle-tractor',
    [[1592, 'Driving tractor']],
    'tractor',
    'трактор, экскаватор-погрузчик, погрузчик: мотор',
  ),
  mixkit(
    'm-idle-tracked',
    [[2753, 'Tank engine working']],
    'engine',
    'экскаватор, бульдозер, траншеекопатель: мотор и гусеницы',
  ),
  mixkit(
    'm-idle-heavy',
    [[828, 'Loud construction machine']],
    'construction',
    'кран, колёсный экскаватор: мотор',
  ),
  mixkit(
    'm-idle-hydraulic',
    [[3178, 'Industrial machine engine hum loop']],
    'industrial',
    'КМУ, автовышка: мотор и насос',
  ),
  mixkit(
    'm-idle-roller',
    [
      [1592, 'Driving tractor'],
      [2139, 'Industrial hum loop'],
    ],
    'tractor',
    'каток: мотор и вибрация',
  ),
  mixkit(
    'm-arrive-dirt-1',
    [[804, 'Construction truck loading dirt']],
    'construction',
    'экскаваторы: ковш с грунтом',
  ),
  mixkit(
    'm-arrive-dirt-2',
    [
      [804, 'Construction truck loading dirt'],
      [402, 'Dirt debris falling'],
    ],
    'construction',
    'экскаваторы, траншеекопатель: грунт',
  ),
  mixkit('m-arrive-brake-1', [[1626, 'Stopping truck']], 'truck', 'самосвал: остановка'),
  mixkit(
    'm-arrive-brake-2',
    [
      [1620, 'Truck slowing down'],
      [2709, 'Hydraulic bus door'],
    ],
    'truck',
    'самосвал: остановка и пневмотормоз',
  ),
  mixkit(
    'm-arrive-beeper-1',
    [[804, 'Construction truck loading dirt']],
    'construction',
    'погрузчик: задний ход с сигналом',
  ),
  mixkit(
    'm-arrive-beeper-2',
    [
      [1621, 'Truck driving steady'],
      [1077, 'Truck reversing beeps loop'],
    ],
    'truck',
    'погрузчик: сигнал заднего хода',
  ),
  mixkit(
    'm-arrive-hydraulic-1',
    [[1619, 'Fire truck ladder extend']],
    'truck',
    'кран, КМУ, автовышка: стрела',
  ),
  mixkit(
    'm-arrive-hydraulic-2',
    [[1618, 'Fire truck ladder engine']],
    'truck',
    'кран, КМУ, автовышка: гидравлика',
  ),
  mixkit(
    'm-arrive-track-1',
    [
      [2756, 'Very old war tank'],
      [2757, 'Metal tank gear shift'],
    ],
    'transport',
    'бульдозер: гусеницы',
  ),
  mixkit(
    'm-arrive-track-2',
    [[802, 'Construction machine motor passing']],
    'construction',
    'бульдозер, каток: проезд',
  ),
  mixkit('m-arrive-tractor-1', [[1596, 'Tractor engine arrival']], 'tractor', 'трактор: подъезд'),
  mixkit(
    'm-arrive-tractor-2',
    [[1602, 'Small tractor arrival on dirt']],
    'tractor',
    'трактор, каток: подъезд',
  ),
  mixkit('m-start-1', [[1623, 'Truck start engine']], 'truck', 'заявка: запуск мотора'),
  mixkit('m-start-2', [[1617, 'Truck accelerating']], 'truck', 'заявка: запуск мотора'),
  // Distant site events
  mixkit('ev-hammer', [[798, 'Light hammering on metal']], 'construction', 'стройка: молоток'),
  mixkit('ev-wood', [[830, 'Hammer hit on wood']], 'construction', 'стройка: молоток по дереву'),
  mixkit('ev-clank', [[835, 'Metal tool drop']], 'tools', 'стройка: инструмент'),
  mixkit(
    'ev-shovel',
    [[805, 'Shovelling on construction place loop']],
    'construction',
    'стройка: лопата',
  ),
  mixkit('ev-debris', [[402, 'Dirt debris falling']], 'dirt', 'стройка: осыпь грунта'),
  mixkit('ev-beeper', [[1077, 'Truck reversing beeps loop']], 'beep', 'стройка: задний ход'),
  // Beds
  mixkit(
    'bed-site-1',
    [[807, 'Road construction ambience loop']],
    'construction',
    'фон: стройка вдалеке',
  ),
  mixkit(
    'bed-site-2',
    [[819, 'Urban construction site ambiance']],
    'construction',
    'фон: стройка в городе',
  ),
  mixkit('bed-city', [[371, 'Sub urban ambience and birds']], 'traffic', 'фон: тихий город'),
  {
    name: 'music-bed',
    title: 'Valley Sunset (#127)',
    author: 'Mixkit',
    license: MIXKIT_MUSIC,
    url: 'https://mixkit.co/free-stock-music/mood/calm/',
    use: 'музыка под всем',
  },
  // Interface
  mixkit('ui-click-1', [[2580, 'Light button']], 'button', 'кнопки: нажатие'),
  mixkit('ui-click-2', [[2585, 'On or off light switch tap']], 'click', 'кнопки: нажатие'),
  mixkit('ui-thunk-1', [[2182, 'Wood hard hit']], 'thud', '«Позвонить», «Отправить»'),
  mixkit('ui-thunk-2', [[837, 'Wood hammer put down']], 'hammer', '«Позвонить», «Отправить»'),
  mixkit('ui-whoosh-1', [[166, 'Fast small sweep transition']], 'swoosh', 'переход страницы'),
  mixkit('ui-whoosh-2', [[1461, 'Short wind swoosh']], 'swoosh', 'переход страницы'),
  mixkit(
    'ui-stamp-1',
    [
      [837, 'Wood hammer put down'],
      [1384, 'Typewriter single mechanical hit'],
    ],
    'hammer',
    'заявка готова: штамп',
  ),
  mixkit(
    'ui-stamp-2',
    [
      [2182, 'Wood hard hit'],
      [1365, 'Mechanical typewriter hit'],
    ],
    'thud',
    'заявка готова: штамп',
  ),
  mixkit('ui-chime-1', [[3109, 'Relaxing bell chime']], 'chimes', 'успех'),
  mixkit('ui-chime-2', [[3108, 'Crystal chime']], 'chimes', 'успех'),
  mixkit('ui-boom', [[2299, 'Short bass hit']], 'hit', 'заставка: логотип'),
  // Walkie-talkie
  mixkit('radio-squelch', [[2561, 'Radio static fx']], 'radio', 'рация: щелчок'),
  mixkit('radio-hiss', [[1447, 'Long static noise']], 'static', 'рация: шум'),
  mixkit('radio-beep', [[1082, 'Censorship beep']], 'beep', 'рация: «пи»'),
  // Nature under the /stroyka film tour
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
];
