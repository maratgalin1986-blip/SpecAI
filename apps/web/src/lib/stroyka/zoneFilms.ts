// Real footage for each stop of /stroyka (owner, 2026-10-03: «не рисовать
// графику — склеить ролик из настоящих съёмок и вставить, чтобы не грузить
// движок»). Each zone plays a short graded loop of open-licence footage
// (Mixkit, see /credits) instead of the 3D scene: files in
// public/film/zones/<zone>.mp4 (1280×720), <zone>-sm.mp4 (854×480) and
// <zone>.webp (poster). The 3D scene stays one tap away.

import type { ZoneId } from '@/lib/stroyka';

export type ZoneFilm = {
  /** What the footage shows, for the screen reader and the credits. */
  alt: string;
  /** Mixkit clip ids the loop is cut from. */
  sources: number[];
};

export const ZONE_FILMS: Record<ZoneId, ZoneFilm> = {
  gate: { alt: 'Стройплощадка с высоты: краны, корпуса, техника', sources: [] },
  kotlovan: { alt: 'Экскаватор грузит грунт в самосвал', sources: [] },
  planirovka: { alt: 'Экскаватор-погрузчик расчищает и планирует участок', sources: [] },
  doroga: { alt: 'Самосвал везёт щебень по площадке', sources: [] },
  sklad: { alt: 'Погрузчик загружает самосвал, поддоны и материалы', sources: [] },
  korpus: { alt: 'Корпус растёт этаж за этажом', sources: [] },
  montazh: { alt: 'Кран поднимает плиту на этаж', sources: [] },
  office: { alt: 'Прораб и инженеры с чертежами на площадке', sources: [] },
  smeta: { alt: 'Бетон, кладка, материалы на объекте', sources: [] },
};

export const zoneFilmSrc = (zone: ZoneId, small: boolean) =>
  `/film/zones/${zone}${small ? '-sm' : ''}.mp4`;
export const zoneFilmPoster = (zone: ZoneId) => `/film/zones/${zone}.webp`;
