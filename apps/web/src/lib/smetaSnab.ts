import type { Smeta, SmetaInput, SmetaRow } from '@/lib/smeta';
import {
  freshPrice,
  MATERIAL_PRICES,
  MATERIALS,
  materialPrice,
  PRICES_NOTE,
  referenceMid,
  type Material,
  type PriceTable,
} from '@/lib/smetaPrices';
import {
  GRILLAGE,
  machineRow,
  NORMS,
  OBJECTS,
  REBAR_KG,
  ROAD,
  roundUp,
  SLAB,
  STRIP,
  type Project,
} from '@/lib/smetaProject';

// «Смета для снабженца»: materials from СпецПласт16 with delivery by its own
// machines. Quantities come from the same project or job, with the reserve
// shown. A row is priced only from a fresh market reference (≤ 14 days) plus
// the СпецПласт16 markup; otherwise «цену подтвердим за 15 минут». The client
// never sees suppliers, stores, sources or the markup. Pure functions.

export const UNPRICED = 'цену подтвердим за 15 минут';

export interface SnabRow {
  material: Material;
  name: string;
  unit: string;
  /** Quantity from the geometry, before the reserve. */
  base: number;
  reserve: number;
  /** Quantity to order: base plus reserve, rounded up. */
  qty: number;
  /** СпецПласт16 price per unit, or null while not confirmed. */
  price: number | null;
  cost: number | null;
}

/** A СпецПласт16 line: delivery, unloading or machinery for the job. */
export interface SnabService {
  /** Shown right after this material. */
  after: Material;
  title: string;
  row: SmetaRow;
}

export interface SnabList {
  title: string;
  rows: SnabRow[];
  /** Delivery and unloading by СпецПласт16. */
  delivery: SnabService[];
  /** Machinery for the same job, offered alongside. */
  machinery: SnabService[];
  /** Upsell hints, e.g. «привезём за 3 рейса — выгоднее одной сменой». */
  hints: string[];
  materialsTotal: number;
  unpriced: number;
  deliveryTotal: number;
  /** Materials + delivery + unloading. */
  total: number;
  /** «Комплект под ключ»: total plus the machinery. */
  kitTotal: number;
}

/** Quantity with reserve, without a price. */
export function snabRow(material: Material, base: number): SnabRow {
  const spec = MATERIALS[material];
  return {
    material,
    name: spec.name,
    unit: spec.unit,
    base: Math.round(base * 10) / 10,
    reserve: spec.reserve,
    qty: roundUp(base * (1 + spec.reserve / 100), spec.step),
    price: null,
    cost: null,
  };
}

/** Prices the rows from fresh references only; the tier follows their reference subtotal. */
export function priceRows(
  rows: SnabRow[],
  today: Date,
  prices: PriceTable = MATERIAL_PRICES,
): SnabRow[] {
  const fresh = rows.map((r) => freshPrice(r.material, today, prices));
  const subtotal = rows.reduce(
    (s, r, i) => s + (fresh[i] ? r.qty * referenceMid(fresh[i]!) : 0),
    0,
  );
  return rows.map((r, i) => {
    const entry = fresh[i];
    if (!entry) return { ...r, price: null, cost: null };
    const price = materialPrice(entry, subtotal);
    return { ...r, price, cost: Math.round(r.qty * price) };
  });
}

/** Base quantities (before reserve) for the whole project. */
export function projectQuantities(project: Project): Partial<Record<Material, number>> {
  const { object, length: L, width: W, foundation } = project.input;
  const { concrete, stripLen, height } = project.geo;
  const area = L * W;
  const perimeter = 2 * (L + W);
  const q: Partial<Record<Material, number>> = {};
  if (object === 'site') {
    q.sand = area * ROAD.sand;
    q.stone = area * ROAD.stone;
    q.geotextile = area;
    return q;
  }
  q.concrete = concrete;
  q.rebar = (concrete * REBAR_KG[foundation]) / 1000;
  if (foundation === 'strip') {
    q.sand = stripLen * STRIP.trench * STRIP.cushion;
    q.formwork = 2 * stripLen * STRIP.bandH;
    q.waterproofing = stripLen * (STRIP.band + 2 * STRIP.depth);
  } else if (foundation === 'slab') {
    q.sand = area * SLAB.sand;
    q.stone = area * SLAB.stone;
    q.formwork = perimeter * (SLAB.thick + 0.1);
    q.waterproofing = area + perimeter * SLAB.thick;
    q.geotextile = area;
  } else {
    q.formwork = 2 * stripLen * GRILLAGE.width;
    q.waterproofing = stripLen * (GRILLAGE.width + 2 * GRILLAGE.depth);
  }
  if (object === 'house' || object === 'banya') {
    // 300 mm walls, minus about 15% for windows and doors.
    q.blocks = perimeter * height * 0.3 * 0.85;
  } else if (object === 'warehouse') {
    q.panels = perimeter * height;
  }
  return q;
}

/** Base quantities for a single-operation job; most jobs need no materials. */
export function jobQuantities(smeta: Smeta, input: SmetaInput): Partial<Record<Material, number>> {
  const v = (id: 'length' | 'width' | 'depth') => {
    const f = smeta.job.fields.find((x) => x.id === id);
    const raw = input[id] ?? f?.initial ?? 0;
    return f ? Math.min(f.max, Math.max(f.min, raw)) : raw;
  };
  if (smeta.job.id === 'trench') {
    // Bedding and cover for the pipe: about 20 cm of sand.
    return { pipe: v('length'), sand: v('length') * v('width') * 0.2 };
  }
  if (smeta.job.id === 'pit') {
    const area = v('length') * v('width');
    return { sand: area * SLAB.sand, geotextile: area };
  }
  return {};
}

const qtyOf = (rows: SnabRow[], m: Material) => rows.find((r) => r.material === m)?.qty ?? 0;

/** «1 рейс», «3 рейса», «5 рейсов». */
export function trips(n: number): string {
  const d = n % 10;
  const h = n % 100;
  const word =
    d === 1 && h !== 11 ? 'рейс' : d >= 2 && d <= 4 && (h < 10 || h >= 20) ? 'рейса' : 'рейсов';
  return `${n} ${word}`;
}

function services(rows: SnabRow[], baseArea: number) {
  const delivery: SnabService[] = [];
  const machinery: SnabService[] = [];
  const hints: string[] = [];
  const bulkRows = rows.filter((r) => r.material === 'sand' || r.material === 'stone');
  const bulk = bulkRows.reduce((s, r) => s + r.qty, 0);
  if (bulk > 0) {
    const n = Math.max(1, Math.ceil(bulk / NORMS.truckM3 - 1e-9));
    const hours = n * NORMS.supplyTripH;
    const last = bulkRows[bulkRows.length - 1]!.material;
    delivery.push({
      after: last,
      title: 'Доставка песка/щебня самосвалом СпецПласт16',
      row: machineRow(
        'truck',
        `${trips(n)} × ${NORMS.supplyTripH.toLocaleString('ru-RU')} ч, ≈ ${bulk.toLocaleString('ru-RU')} м³`,
        hours,
      ),
    });
    if (bulk > NORMS.truckM3) {
      hints.push(
        hours <= 8
          ? `Привезём за ${trips(n)} — выгоднее одной сменой самосвала СпецПласт16.`
          : `Привезём за ${trips(n)}: пустим несколько самосвалов СпецПласт16 — выгоднее сменами.`,
      );
    }
    if (baseArea > 0) {
      machinery.push({
        after: last,
        title: 'Уплотнение основания виброкатком СпецПласт16',
        row: machineRow(
          'roller',
          `${Math.round(baseArea).toLocaleString('ru-RU')} м² × 2 слоя`,
          (baseArea * 2) / NORMS.roller,
        ),
      });
    }
  }
  const lifts =
    Math.ceil(qtyOf(rows, 'blocks') / 1.8) +
    Math.ceil(qtyOf(rows, 'panels') / 40) +
    Math.ceil(qtyOf(rows, 'rebar'));
  if (lifts > 0) {
    const after: Material = qtyOf(rows, 'blocks')
      ? 'blocks'
      : qtyOf(rows, 'panels')
        ? 'panels'
        : 'rebar';
    const what = { blocks: 'блоков', panels: 'панелей', rebar: 'арматуры' }[
      after as 'blocks' | 'panels' | 'rebar'
    ];
    delivery.push({
      after,
      title: `Доставка и разгрузка ${what} манипулятором СпецПласт16`,
      row: machineRow(
        'kmu',
        `${lifts} подъём(ов) с машины на площадку`,
        NORMS.kmuTripH + lifts * NORMS.kmuLift,
      ),
    });
    if (after !== 'rebar') {
      const up = Math.ceil(qtyOf(rows, after) / (after === 'blocks' ? 1.8 : 40));
      machinery.push({
        after,
        title: `Подъём ${what} на этажи автокраном СпецПласт16`,
        row: machineRow(
          'crane',
          `${up} подъём(ов) поддонов`,
          NORMS.craneSetup + up * NORMS.craneLift,
        ),
      });
    }
  }
  return { delivery, machinery, hints };
}

function assemble(
  title: string,
  q: Partial<Record<Material, number>>,
  baseArea: number,
  today: Date,
  prices: PriceTable,
): SnabList {
  const rows = priceRows(
    (Object.keys(MATERIALS) as Material[])
      .filter((m) => (q[m] ?? 0) > 0)
      .map((m) => snabRow(m, q[m]!)),
    today,
    prices,
  );
  const extra = services(rows, baseArea);
  const materialsTotal = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
  const deliveryTotal = extra.delivery.reduce((s, d) => s + d.row.sum, 0);
  const machineryTotal = extra.machinery.reduce((s, d) => s + d.row.sum, 0);
  return {
    title,
    rows,
    ...extra,
    materialsTotal,
    unpriced: rows.filter((r) => r.price === null).length,
    deliveryTotal,
    total: materialsTotal + deliveryTotal,
    kitTotal: materialsTotal + deliveryTotal + machineryTotal,
  };
}

export function projectSnab(
  project: Project,
  today: Date,
  prices: PriceTable = MATERIAL_PRICES,
): SnabList {
  const i = project.input;
  const baseArea = i.object === 'site' || i.foundation === 'slab' ? i.length * i.width : 0;
  return assemble(
    `${OBJECTS[i.object].title} ${i.length}×${i.width} м`,
    projectQuantities(project),
    baseArea,
    today,
    prices,
  );
}

export function jobSnab(
  smeta: Smeta,
  input: SmetaInput,
  today: Date,
  prices: PriceTable = MATERIAL_PRICES,
): SnabList {
  const q = jobQuantities(smeta, input);
  const baseArea = smeta.job.id === 'pit' ? (q.geotextile ?? 0) : 0;
  return assemble(smeta.job.title, q, baseArea, today, prices);
}

/** Rows the partial (locked) version shows: the first three at most, about half. */
export const visibleSnabRows = (list: SnabList) =>
  Math.min(list.rows.length, Math.max(1, Math.min(3, Math.ceil(list.rows.length / 2))));

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;
const num = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** «Материалы + доставка + разгрузка ≈ X ₽», plus the rows still to confirm. */
export function totalLine(list: SnabList): string {
  const tail = list.unpriced ? ` + ${list.unpriced} поз. — ${UNPRICED}` : '';
  return `Материалы + доставка + разгрузка ≈ ${rub(list.total)}${tail}`;
}

/** One CSV field for Excel: quoted when it holds a separator, a quote or a newline. */
export function csvField(value: string | number): string {
  const s = typeof value === 'number' ? num(value) : value;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV for Excel: UTF-8 BOM, «;» separator, decimal comma, CRLF. */
export function snabCsv(list: SnabList): string {
  const lines: (string | number)[][] = [
    [`Материалы от СпецПласт16 с доставкой: ${list.title} (примерно)`],
    ['Позиция', 'Ед.', 'По расчёту', 'Запас, %', 'К заказу', 'Цена СпецПласт16, ₽/ед.', 'Сумма, ₽'],
    ...list.rows.map((r) => [
      r.name,
      r.unit,
      r.base,
      r.reserve,
      r.qty,
      r.price ?? UNPRICED,
      r.cost ?? '',
    ]),
    [],
    ['Техника СпецПласт16', 'Часы', 'Ставка, ₽/ч', 'Сумма, ₽'],
    ...[...list.delivery, ...list.machinery].map((d) => [
      `${d.title}: ${d.row.task}`,
      d.row.hours,
      d.row.rate,
      d.row.sum,
    ]),
    [],
    [totalLine(list)],
    [`Комплект под ключ (материалы, доставка, техника) ≈ ${rub(list.kitTotal)}`],
    [PRICES_NOTE],
  ];
  return '﻿' + lines.map((l) => l.map(csvField).join(';')).join('\r\n') + '\r\n';
}

/** The order text for the lead or WhatsApp; at most 1000 characters (lead API). */
export function snabText(list: SnabList): string {
  const row = (r: SnabRow) =>
    `• ${r.name}: ${r.qty.toLocaleString('ru-RU')} ${r.unit} (запас ${r.reserve}%)` +
    (r.price !== null ? ` × ${rub(r.price)} = ${rub(r.cost!)}` : ` — ${UNPRICED}`);
  return [
    `Заказ материалов у СпецПласт16: ${list.title}.`,
    ...list.rows.map(row),
    ...list.delivery.map((d) => `• ${d.title}: ${d.row.hours} ч = ${rub(d.row.sum)}`),
    `${totalLine(list)}.`,
    ...(list.machinery.length ? [`Комплект под ключ с техникой ≈ ${rub(list.kitTotal)}.`] : []),
    'Прошу подтвердить заказ.',
  ]
    .join('\n')
    .slice(0, 1000);
}
