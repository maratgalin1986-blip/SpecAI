// «Фото с бригадой»: the caption and layout of the branded frame drawn
// around a snapshot of the 3D site. Pure; the page draws it on a canvas.

import { SITE } from '@/lib/site';

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export interface PhotoCaption {
  title: string;
  date: string;
  site: string;
}

/** The caption under the photo: brand, date (Moscow time) and the site address as plain text. */
export function photoCaption(date: Date, host: string): PhotoCaption {
  const msk = new Date(date.getTime() + 3 * 3600_000);
  return {
    title: `Я на стройке ${SITE.platform} · ${SITE.name}`,
    date: `${msk.getUTCDate()} ${MONTHS[msk.getUTCMonth()]} ${msk.getUTCFullYear()}`,
    site: host.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
  };
}

/** The file name for the download. */
export function photoFileName(date: Date): string {
  const msk = new Date(date.getTime() + 3 * 3600_000);
  return `specplast16-stroyka-${msk.toISOString().slice(0, 10)}.png`;
}

export interface PhotoLayout {
  width: number;
  height: number;
  pad: number;
  band: number;
  photo: { x: number; y: number; w: number; h: number };
}

/**
 * Frame geometry for a snapshot of w×h: the photo scaled to at most 1600 px
 * wide, a border and a caption band under it.
 */
export function photoLayout(w: number, h: number): PhotoLayout {
  const scale = Math.min(1, 1600 / Math.max(1, w));
  const pw = Math.round(w * scale);
  const ph = Math.round(h * scale);
  const pad = Math.max(12, Math.round(pw * 0.02));
  const band = Math.max(84, Math.round(pw * 0.11));
  return {
    width: pw + pad * 2,
    height: ph + pad * 2 + band,
    pad,
    band,
    photo: { x: pad, y: pad, w: pw, h: ph },
  };
}
