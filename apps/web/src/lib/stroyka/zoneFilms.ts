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
  gate: { alt: 'Стройплощадка с высоты: краны, корпуса, техника', sources: [42333] },
  kotlovan: { alt: 'Экскаватор грузит грунт в самосвал', sources: [25444] },
  planirovka: { alt: 'Бульдозер расчищает и планирует участок', sources: [49142] },
  doroga: { alt: 'Самосвалы возят грунт по технологической дороге', sources: [45816, 10327] },
  sklad: { alt: 'Погрузчик загружает самосвал, поддоны и материалы', sources: [49189] },
  korpus: { alt: 'Корпус растёт этаж за этажом', sources: [9686] },
  montazh: { alt: 'Кран поднимает пакет опалубки на этаж', sources: [31473] },
  office: { alt: 'Прораб и инженеры с чертежами на площадке', sources: [23511] },
  smeta: { alt: 'Бетон, кладка, материалы на объекте', sources: [14729, 20874] },
};

export const zoneFilmSrc = (zone: ZoneId, small: boolean) =>
  `/film/zones/${zone}${small ? '-sm' : ''}.mp4`;
export const zoneFilmPoster = (zone: ZoneId) => `/film/zones/${zone}.webp`;
