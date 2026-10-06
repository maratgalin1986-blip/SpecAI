// Real footage for each stop of /stroyka (owner, 2026-10-03: «не рисовать
// графику — склеить ролик из настоящих съёмок и вставить, чтобы не грузить
// движок»). Each zone plays a short graded loop of open-licence footage
// (Mixkit, see /credits): files in
// public/film/zones/<zone>.mp4 (1280×720), <zone>-sm.mp4 (854×480) and
// <zone>.webp (poster); phones held upright get <zone>-v.mp4 / -v.webp, a
// 720×1280 reframe centred on the subject.

import type { ZoneId } from '@/lib/stroyka';

export type ZoneFilm = {
  /** What the footage shows, for the screen reader and the credits. */
  alt: string;
  /** Mixkit clip ids the loop is cut from. */
  sources: number[];
  /** CSS object-position of the subject, for landscape screens that crop the frame. */
  focus: string;
};

export const ZONE_FILMS: Record<ZoneId, ZoneFilm> = {
  gate: {
    alt: 'Стройплощадка с высоты: краны, корпуса, техника',
    sources: [42333],
    focus: '45% 50%',
  },
  kotlovan: { alt: 'Экскаватор грузит грунт в самосвал', sources: [25444], focus: '40% 50%' },
  planirovka: {
    alt: 'Бульдозер сдвигает отвалом грунт и расчищает участок',
    sources: [49144],
    focus: '75% 55%',
  },
  doroga: {
    alt: 'Самосвалы возят грунт по технологической дороге',
    sources: [45816, 10327],
    focus: '45% 55%',
  },
  sklad: {
    alt: 'Погрузчик загружает самосвал, поддоны и материалы',
    sources: [49189],
    focus: '45% 50%',
  },
  korpus: { alt: 'Корпус растёт этаж за этажом', sources: [9686], focus: '60% 50%' },
  montazh: { alt: 'Кран поднимает пакет опалубки на этаж', sources: [31473], focus: '45% 50%' },
  office: {
    alt: 'Прораб сверяется с рабочими чертежами на объекте, рядом кирпич',
    sources: [1437],
    focus: '45% 50%',
  },
  smeta: {
    alt: 'Бетон, кладка, материалы на объекте',
    sources: [14729, 20874],
    focus: '55% 50%',
  },
};

export const zoneFilmSrc = (zone: ZoneId, small: boolean, portrait = false) =>
  `/film/zones/${zone}${portrait ? '-v' : small ? '-sm' : ''}.mp4`;
export const zoneFilmPoster = (zone: ZoneId, portrait = false) =>
  `/film/zones/${zone}${portrait ? '-v' : ''}.webp`;
