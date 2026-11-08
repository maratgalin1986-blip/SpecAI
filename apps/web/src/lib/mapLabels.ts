// The words of the permanent labels over the pins of the customers' map
// (/map, owner 2026-10-18: «видно все точки исполнителей с надписями над их
// иконками»). Only what the public map already shows: the company's name and
// how much machinery it has, СпецПласт16 marked as such; for a machine on the
// line the server's bubble («машина · цена · имя», lib/linePresence.ts). No
// phones, no addresses. Pure, unit-tested.

import { pluralizeRu } from './pluralize';
import { SITE } from './site';

/** Labels longer than this are cut: the map reads them at 360 px. */
export const LABEL_NAME_MAX = 28;

function cut(text: string, max = LABEL_NAME_MAX): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export interface MapLabel {
  /** The bold first line. */
  title: string;
  /** The small second line. */
  sub: string;
}

/**
 * A provider's base: «Стройтех» / «4 машины»; the house fleet: «СпецПласт16» /
 * «свой парк · 12 машин»; with a machine on the line now «на линии · 4 машины»
 * (owner, 2026-11-08: offline providers stay on the map, only quieter — the
 * label never says when they registered or were last seen).
 */
export function providerLabel(pin: {
  name: string;
  equipmentCount: number;
  isHouse: boolean;
  onLine?: boolean;
}): MapLabel {
  const machines = pluralizeRu(pin.equipmentCount, ['машина', 'машины', 'машин']);
  const line = pin.onLine ? 'на линии · ' : '';
  return pin.isHouse
    ? { title: SITE.name, sub: `${line}свой парк · ${machines}` }
    : { title: cut(pin.name), sub: `${line}${machines}` };
}

/** A customer's open order: «Заказчик рядом» / «нужно: Экскаваторы · Анна П.» (lib/mapCustomers.ts). */
export function customerLabel(pin: { title: string; sub: string }): MapLabel {
  return { title: cut(pin.title, 40), sub: cut(pin.sub, 60) };
}

/**
 * A machine on the line: the server's bubble «Я на линии · Экскаватор JCB ·
 * от 4 000 ₽/ч · Марат Г.» as a small «Я на линии» (with «СпецПласт16» for
 * the house fleet) over the rest.
 */
export function liveLabel(machine: { bubble: string; company: { isHouse: boolean } }): MapLabel {
  const separator = ' · ';
  const index = machine.bubble.indexOf(separator);
  const head = index < 0 ? machine.bubble : machine.bubble.slice(0, index);
  const body = index < 0 ? '' : machine.bubble.slice(index + separator.length);
  return {
    title: cut(body || head, 60),
    sub: machine.company.isHouse ? `${head} · ${SITE.name}` : head,
  };
}
