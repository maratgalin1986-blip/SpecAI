import type { DesignParams } from '@/lib/design/types';

// «Готовые дизайны»: free presets. Each one is parameters and a seed — the
// generator draws it in the browser; there are no images.

export interface Preset {
  id: string;
  title: string;
  hint: string;
  params: DesignParams;
  seed: number;
}

export const PRESETS: Preset[] = [
  {
    id: 'scandi-8x10',
    title: 'Скандинавский дом 10×8',
    hint: 'Одноэтажный, 2 спальни, кухня-гостиная на юг',
    params: {
      object: 'house',
      length: 10,
      width: 8,
      floors: 1,
      rooms: 2,
      style: 'scandi',
      budget: 'mid',
    },
    seed: 108,
  },
  {
    id: 'loft-garage',
    title: 'Лофт-гараж',
    hint: 'Гараж с мастерской, студия на втором этаже',
    params: {
      object: 'garage',
      length: 9,
      width: 6,
      floors: 2,
      rooms: 1,
      style: 'loft',
      budget: 'mid',
    },
    seed: 214,
  },
  {
    id: 'banya-barrel',
    title: 'Баня-бочка',
    hint: 'Предбанник, мойка и парная в бочке 6 м',
    params: {
      object: 'banya',
      length: 6,
      width: 2.4,
      floors: 1,
      rooms: 0,
      style: 'eco',
      budget: 'econom',
    },
    seed: 33,
  },
  {
    id: 'modern-cottage-2',
    title: 'Современный коттедж в 2 этажа',
    hint: '12×10, 4 спальни, мастер-спальня с гардеробом',
    params: {
      object: 'house',
      length: 12,
      width: 10,
      floors: 2,
      rooms: 4,
      style: 'modern',
      budget: 'premium',
    },
    seed: 412,
  },
  {
    id: 'landscape-10',
    title: 'Ландшафт участка 10 соток',
    hint: '25×40 м: парковка, терраса, огород, сад, площадка',
    params: {
      object: 'landscape',
      length: 40,
      width: 25,
      floors: 0,
      rooms: 0,
      style: 'eco',
      budget: 'mid',
    },
    seed: 1010,
  },
  {
    id: 'kitchen-living-30',
    title: 'Кухня-гостиная 30 м²',
    hint: 'Одно помещение 6×5: кухня, столовая, гостиная',
    params: {
      object: 'flat',
      length: 6.6,
      width: 5.6,
      floors: 1,
      rooms: 0,
      style: 'scandi',
      budget: 'mid',
    },
    seed: 30,
  },
  {
    id: 'minimal-2room',
    title: 'Двушка в минимализме',
    hint: 'Квартира 59 м²: 2 комнаты, кухня-гостиная',
    params: {
      object: 'flat',
      length: 11.5,
      width: 6,
      floors: 1,
      rooms: 2,
      style: 'minimal',
      budget: 'mid',
    },
    seed: 54,
  },
  {
    id: 'classic-12x12',
    title: 'Классический дом 12×12',
    hint: 'Два этажа, вальмовая кровля, 3 спальни',
    params: {
      object: 'house',
      length: 12,
      width: 12,
      floors: 2,
      rooms: 3,
      style: 'classic',
      budget: 'premium',
    },
    seed: 1212,
  },
  {
    id: 'eco-9x9',
    title: 'Эко-дом 9×9',
    hint: 'Одноэтажный из бруса, 2 спальни',
    params: {
      object: 'house',
      length: 9,
      width: 9,
      floors: 1,
      rooms: 2,
      style: 'eco',
      budget: 'econom',
    },
    seed: 99,
  },
  {
    id: 'banya-6x4',
    title: 'Баня 6×4 с комнатой отдыха',
    hint: 'Тамбур, комната отдыха, мойка, парная',
    params: {
      object: 'banya',
      length: 6,
      width: 4,
      floors: 1,
      rooms: 0,
      style: 'classic',
      budget: 'mid',
    },
    seed: 64,
  },
  {
    id: 'garage-2cars',
    title: 'Гараж на 2 машины',
    hint: '9×7 м, двое ворот, кладовая',
    params: {
      object: 'garage',
      length: 9,
      width: 7,
      floors: 1,
      rooms: 2,
      style: 'modern',
      budget: 'econom',
    },
    seed: 97,
  },
  {
    id: 'landscape-6',
    title: 'Дачный участок 6 соток',
    hint: '20×30 м: дом, грядки, детская площадка и сад',
    params: {
      object: 'landscape',
      length: 30,
      width: 20,
      floors: 0,
      rooms: 0,
      style: 'scandi',
      budget: 'econom',
    },
    seed: 600,
  },
];
