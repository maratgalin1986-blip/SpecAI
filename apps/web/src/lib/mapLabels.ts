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

/**
 * Machines on the line that stand at one point without live GPS (a fleet at
 * its base — СпецПласт16's is always there, owner 2026-11-11) are one pin, not
 * a pile of fifteen: the groups in the order of the list. A machine with live
 * GPS is always its own pin; so is a provider's single machine.
 */
export function groupLive<
  T extends { lat: number; lon: number; live?: boolean; company: { isHouse: boolean } },
>(machines: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  machines.forEach((machine, index) => {
    const key = machine.live
      ? `live:${index}`
      : `${machine.company.isHouse ? 'house' : 'other'}:${machine.lat.toFixed(4)},${machine.lon.toFixed(4)}`;
    groups.set(key, [...(groups.get(key) ?? []), machine]);
  });
  return [...groups.values()];
}

/** «12 машин на линии» / «СпецПласт16» over a pin that stands for several machines. */
export function liveGroupLabel(
  group: readonly { busyToday?: boolean; company: { isHouse: boolean } }[],
): MapLabel {
  const free = group.filter((machine) => !machine.busyToday).length;
  const word = (count: number) => pluralizeRu(count, ['машина', 'машины', 'машин']);
  return {
    title: free > 0 ? `${word(free)} на линии` : `${word(group.length)} · заняты сегодня`,
    sub: group[0]?.company.isHouse ? SITE.name : 'Я на линии',
  };
}
