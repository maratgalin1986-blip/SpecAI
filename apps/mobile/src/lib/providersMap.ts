/**
 * Карта исполнителей в приложении: точки компаний и открытых заявок из
 * GET /api/providers/map на Leaflet + OpenStreetMap во WebView. «Все видят
 * всех» (владелец, 2026-11-08): исполнитель на карте всегда, офлайн —
 * приглушённым значком; телефон — только если исполнитель сам его показывает
 * (сервер отдаёт null, когда скрыл); без e-mail, адресов и дат регистрации.
 * Здесь — чистая сборка HTML-страницы карты, покрыта тестами
 * (providersMap.test.ts); экран — components/ProvidersMap.tsx.
 */

export interface ProviderPin {
  id: string;
  name: string;
  lat: number;
  lon: number;
  note: string | null;
  imageUrl: string | null;
  equipmentCount: number;
  isHouse: boolean;
  catalogUrl: string;
  /** Виды техники («Экскаваторы», «Самосвалы»), не больше трёх; остальные — machinesMore. */
  machines?: string[];
  machinesMore?: number;
  /** Город базы; адреса на карте нет. */
  city?: string | null;
  /** «от 24 000 ₽/смена». */
  priceText?: string | null;
  /** «+7 927 242-80-88» и «tel:+7…»; null — исполнитель скрыл номер. */
  phone?: string | null;
  phoneHref?: string | null;
  /** Есть машина «на линии»: зелёное кольцо; false — приглушённый значок. */
  onLine?: boolean;
  /** «Написать»: заявка этому исполнителю на сайте. */
  orderUrl?: string;
}

/**
 * Открытая заявка на карте («Заказчик рядом»): точка огрублена сервером до
 * километра, имя — «Анна П.», ни телефона, ни адреса.
 */
export interface CustomerPin {
  id: string;
  lat: number;
  lon: number;
  /** «Заказчик рядом». */
  title: string;
  /** «нужно: Экскаваторы · Анна П.». */
  sub: string;
  machinery: string;
  customer: string;
  orderUrl: string;
  approximate: boolean;
}

/**
 * Площадка работает по всей России: без точек и без положения телефона карта
 * открывается обзором страны (её европейской части на экране телефона), с
 * одной точкой — на ней, с несколькими — по их границам; положение заказчика
 * (window.setMe) переносит карту к нему.
 */
export const MAP_CENTER = { lat: 57, lon: 55 } as const;
export const MAP_OVERVIEW_ZOOM = 3;
/** Тайлы прокси сайта есть с этого масштаба (apps/web/src/lib/geo.ts TILE_MIN_ZOOM). */
export const MAP_MIN_ZOOM = 3;

/**
 * Точка площадки «приём заявок» (GET /api/providers/map, поле intake): крупный
 * город без исполнителей рядом. Не компания и не машина: только город, его
 * центр и подпись площадки; нажатие открывает заявку с этим городом.
 */
export interface IntakePin {
  city: string;
  lat: number;
  lon: number;
  /** «ИИСтройка24 · приём заявок». */
  title: string;
  /** «Казань: оставьте заявку — найдём технику». */
  text: string;
}

/** Подпись над точкой парка СпецПласт16 — всегда так, как бы ни называлась строка. */
export const HOUSE_LABEL = 'СпецПласт16';
/** Ниже этого масштаба (страна, область) подписи прячутся; в городе видны все. */
export const LABELS_MIN_ZOOM = 8;
/** Машина на линии ближе этого скрывает точку «приём заявок» (как на сайте). */
export const INTAKE_CLEAR_KM = 30;

/** Как долго карта ждёт после сдвига, прежде чем спросить точки нового окна. */
export const BBOX_DEBOUNCE_MS = 400;
/** Сколько исполнителей сервер отдаёт на одно окно карты (MAP_PINS_LIMIT на сайте). */
export const MAP_PINS_LIMIT = 300;
/** Больше точек в памяти карты не держим: дальние от окна отбрасываются первыми. */
export const MAP_PINS_KEEP = 900;

/**
 * Подпись над точкой компании: название и число машин; у парка — «СпецПласт16»;
 * с машиной на линии — «на линии · 4 машины». Когда исполнитель был в сети или
 * зарегистрировался, подпись не говорит никогда.
 */
export function pinLabel(
  pin: Pick<ProviderPin, 'name' | 'equipmentCount' | 'isHouse'> & { onLine?: boolean },
): {
  title: string;
  sub: string;
} {
  const machines = machinesLabel(pin.equipmentCount);
  const line = pin.onLine ? 'на линии · ' : '';
  if (pin.isHouse) return { title: HOUSE_LABEL, sub: `${line}свой парк · ${machines}` };
  const name = pin.name.replace(/\s+/g, ' ').trim();
  return {
    title: name.length > 28 ? `${name.slice(0, 27).trimEnd()}…` : name,
    sub: `${line}${machines}`,
  };
}

/** «Экскаваторы, Самосвалы, ещё 2» — виды техники в карточке точки; null, если сервер их не прислал. */
export function pinMachinesText(
  pin: Pick<ProviderPin, 'machines' | 'machinesMore'>,
): string | null {
  const types = (pin.machines ?? [])
    .map((type) => type.replace(/\s+/g, ' ').trim())
    .filter((type) => type.length > 0);
  if (types.length === 0) return null;
  const more = Math.floor(Number(pin.machinesMore) || 0);
  return more > 0 ? `${types.join(', ')}, ещё ${more}` : types.join(', ');
}

/**
 * Переключатели исполнителя «Показывать меня на карте» и «Показывать телефон
 * на карте» (GET/PATCH /api/companies/me): null и отсутствие поля — включено.
 */
export function mapSwitchOn(value: boolean | null | undefined): boolean {
  return value !== false;
}

/** Ссылка для звонка с карты: только «tel:+цифры», иначе null. */
export function safeTel(href: unknown): string | null {
  return typeof href === 'string' && /^tel:\+?\d{6,15}$/.test(href) ? href : null;
}

/** Путь на сайте из ответа карты («/orders/…»): не чужой хост и не схема. */
export function safeSitePath(path: unknown): string | null {
  if (typeof path !== 'string' || path.length > 300) return null;
  return /^\/(?!\/)[^\s\\]*$/.test(path) ? path : null;
}

/** Окно карты: юг, запад, север, восток. */
export interface MapBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * «south,west,north,east» для ?bbox= (три знака, около 100 м): широта и
 * долгота обрезаются до допустимых, вырожденное или нечисловое окно — null.
 */
export function bboxParam(box: Partial<MapBox> | null | undefined): string | null {
  if (!box) return null;
  const values = [box.south, box.west, box.north, box.east];
  if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  const clamp = (value: number, limit: number) => Math.min(limit, Math.max(-limit, value));
  const south = clamp(box.south!, 90);
  const north = clamp(box.north!, 90);
  const west = clamp(box.west!, 180);
  const east = clamp(box.east!, 180);
  if (south >= north || west >= east) return null;
  return [south, west, north, east].map((value) => value.toFixed(3)).join(',');
}

/**
 * Точки после ответа на окно карты: всё, что сервер прислал для окна, плюс
 * прежние точки ВНЕ окна (их не спрашивали — при отдалении карта не пустеет).
 * Прежняя точка внутри окна, которой в ответе нет, исчезает: исполнитель
 * снял себя с карты или заявку закрыли.
 */
export function mergeInBox<T extends { id: string; lat: number; lon: number }>(
  previous: readonly T[],
  fresh: readonly T[],
  box: MapBox,
  keep: number = MAP_PINS_KEEP,
): T[] {
  const ids = new Set(fresh.map((item) => item.id));
  const inside = (item: T) =>
    item.lat >= box.south && item.lat <= box.north && item.lon >= box.west && item.lon <= box.east;
  return [...fresh, ...previous.filter((item) => !ids.has(item.id) && !inside(item))].slice(
    0,
    keep,
  );
}

/** Что страница карты знает о точке исполнителя (window.setPins и первая отрисовка). */
export function toPagePins(pins: ProviderPin[]) {
  return sortPins(pins).map((pin) => ({
    id: pin.id,
    name: pin.name,
    lat: pin.lat,
    lon: pin.lon,
    note: pin.note,
    house: pin.isHouse,
    // Старый сервер поля не шлёт: тогда значок обычный, не приглушённый.
    on: typeof pin.onLine === 'boolean' ? pin.onLine : null,
    machines: machinesLabel(pin.equipmentCount),
    label: pinLabel(pin),
    catalogUrl: pin.catalogUrl,
    city: pin.city?.trim() || null,
    types: pinMachinesText(pin),
    price: pin.priceText?.trim() || null,
    phone: safeTel(pin.phoneHref) ? pin.phone?.trim() || null : null,
    phoneHref: pin.phone?.trim() ? safeTel(pin.phoneHref) : null,
    orderUrl: safeSitePath(pin.orderUrl),
  }));
}

/** Что страница карты знает о заявке заказчика: подпись и ссылка, ничего личного. */
export function toPageCustomers(customers: CustomerPin[]) {
  return customers
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
    .map((item) => ({
      id: item.id,
      lat: item.lat,
      lon: item.lon,
      title: item.title,
      sub: item.sub,
      orderUrl: safeSitePath(item.orderUrl),
    }));
}

/** СпецПласт16 первым (правило владельца), остальные — у кого больше техники. */
export function sortPins(pins: ProviderPin[]): ProviderPin[] {
  return [...pins].sort(
    (a, b) => Number(b.isHouse) - Number(a.isHouse) || b.equipmentCount - a.equipmentCount,
  );
}

/** «3 машины» — подпись в карточке точки. */
export function machinesLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? 'машина'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'машины'
        : 'машин';
  return `${count} ${word}`;
}

/** JSON для вставки в <script>: «<» экранируется, строка не закроет тег. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
    .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');
}

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';
/**
 * Тайлы OSM — через кэширующий прокси сайта (apps/web/src/app/api/tiles), как на
 * сайте: быстрее, надёжнее и по политике OSM. Хост — тот же, что у API (копия
 * правила из lib/api.ts без импорта: этот модуль чистый и крутится в vitest);
 * без EXPO_PUBLIC_API_URL — боевой сайт, localhost с телефона недоступен.
 */
export const TILES_URL = `${(process.env.EXPO_PUBLIC_API_URL || 'https://spec-ai-web.vercel.app').replace(/\/+$/, '')}/api/tiles/{z}/{x}/{y}`;

/**
 * Страница карты: маркеры компаний, СпецПласт16 выделен цветом бренда, над
 * каждой точкой — постоянная подпись (владелец, 2026-10-18: «надписи над их
 * иконками»); в городе видны все, на обзоре страны прячутся, налезающие друг
 * на друга — тоже (сначала остаются СпецПласт16, затем машины на линии,
 * компании, заявки заказчиков, точки «приём заявок»); скрытая подпись
 * открывается нажатием.
 *
 * «Все видят всех» (владелец, 2026-11-08): исполнитель с машиной на линии —
 * с зелёным кольцом, без неё — приглушённый, но на карте; в карточке город,
 * виды техники, цена и «Позвонить» ({type:'call', href}) либо «Написать»
 * ({type:'write', orderUrl}), когда номер скрыт. Заявки заказчиков — значки
 * «Заказчик рядом» ({type:'order', id, orderUrl}). Нажатие на значок
 * центрирует карту и просит у приложения список ближайших
 * ({type:'select', key} → window.showNearby). После сдвига карта сообщает
 * своё окно ({type:'bbox', south, west, north, east}), приложение отвечает
 * новыми точками через window.setPins.
 *
 * «Техника исполнителя» отправляет {type:'provider', id, catalogUrl},
 * точка «приём заявок» — {type:'intake', city}.
 */
export function providersMapHtml(
  pins: ProviderPin[],
  colors: { primary: string; dark: string; onDark: string; text: string },
  intake: IntakePin[] = [],
  customers: CustomerPin[] = [],
): string {
  const data = toPagePins(pins);
  const customerData = toPageCustomers(customers);
  const intakeData = intake.map((point) => ({
    city: point.city,
    lat: point.lat,
    lon: point.lon,
    title: point.title,
    text: point.text,
  }));
  return `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="${LEAFLET}/leaflet.css">
<style>
html,body,#map{margin:0;height:100%;background:#eceff1;font-family:-apple-system,Roboto,sans-serif}
.pin{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:17px;
background:${colors.dark};color:${colors.onDark};font:700 12px sans-serif;border:2px solid #fff;
box-shadow:0 2px 6px rgba(0,0,0,.35)}
.pin.house{background:${colors.primary};width:40px;height:40px;border-radius:20px;font-size:13px}
.pin.site{background:transparent;border:0;box-shadow:none;font-size:30px;line-height:34px}
.pin.live{background:#1b8a3a;border-color:#fff}
.pin.live.house{background:${colors.primary}}
.pin.on{box-shadow:0 0 0 3px #1b8a3a,0 2px 6px rgba(0,0,0,.35)}
.pin.off{opacity:.6;filter:grayscale(.7);box-shadow:none}
.pin.cust{background:#7c3aed;font-size:16px}
.me{width:18px;height:18px;border-radius:9px;background:#2b6cff;border:3px solid #fff;box-shadow:0 0 0 6px rgba(43,108,255,.25)}
.leaflet-tooltip.bubble{background:#fff;color:${colors.text};border:0;border-radius:14px;padding:5px 10px;
font:600 12px/15px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25);white-space:normal;width:max-content;max-width:220px;
text-align:left;overflow-wrap:anywhere}
.leaflet-tooltip.bubble small{display:block;font:500 10px/12px sans-serif;color:#5f6b73}
.leaflet-tooltip.bubble .note{display:block;font:500 11px/13px sans-serif;color:#5f6b73;margin-top:1px}
.leaflet-tooltip.bubble:before{display:none}
.leaflet-tooltip.bubble.house{border:2px solid ${colors.primary}}
.leaflet-tooltip.lbl{background:#fff;color:${colors.text};border:0;border-radius:10px;padding:3px 8px;
font:600 11px/14px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25);white-space:normal;width:max-content;max-width:180px;
text-align:center;overflow-wrap:anywhere}
.leaflet-tooltip.lbl small{display:block;font:500 10px/12px sans-serif;color:#5f6b73}
.leaflet-tooltip.lbl:before{display:none}
.leaflet-tooltip.lbl.house{border:2px solid ${colors.primary}}
.leaflet-tooltip.lbl.cust{border:1px solid #7c3aed}
.leaflet-tooltip.lbl.intake{border:1px dashed #b45309;background:#fffbeb}
.pin.intake{background:#fffbeb;color:#b45309;border:2px dashed #b45309;font-size:16px}
.labels-off .leaflet-tooltip,.leaflet-tooltip.clash{visibility:hidden}
.leaflet-tooltip.forced{visibility:visible;z-index:700}
.card{min-width:190px;color:${colors.text}}
.card b{display:block;font-size:15px;margin-bottom:2px}
.card small{display:block;color:#5f6b73;margin:2px 0}
.card small.on{color:#1b8a3a;font-weight:700}
.card small.price{color:${colors.text};font-weight:700}
.card button{margin-top:8px;width:100%;min-height:40px;border:0;border-radius:20px;
background:${colors.dark};color:${colors.onDark};font:700 14px sans-serif}
.card button.call{background:${colors.primary};color:#fff;min-height:44px}
.pin.base{width:44px;height:44px;border-radius:22px;font-size:12px}
.card .list{max-height:240px;overflow-y:auto;margin-top:4px}
.card button.row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;
background:#f3f4f6;color:${colors.text};border-radius:12px;padding:6px 10px;text-align:left;font:600 13px sans-serif}
.card button.row small{margin:0;white-space:nowrap}
.card button.row span small{white-space:normal;font-weight:500}
.card .near{margin-top:8px}
.card .near b{font-size:12px;color:#5f6b73;margin:0}
</style>
</head><body>
<div id="map"></div>
<script src="${LEAFLET}/leaflet.js"></script>
<script>
var pins = ${scriptJson(data)};
var customers = ${scriptJson(customerData)};
var intake = ${scriptJson(intakeData)};
var LABELS_MIN_ZOOM = ${LABELS_MIN_ZOOM};
var INTAKE_CLEAR_KM = ${INTAKE_CLEAR_KM};
var BBOX_DEBOUNCE_MS = ${BBOX_DEBOUNCE_MS};
var map = L.map('map', { zoomControl: false, attributionControl: true })
  .setView([${MAP_CENTER.lat}, ${MAP_CENTER.lon}], ${MAP_OVERVIEW_ZOOM});
L.tileLayer(${JSON.stringify(TILES_URL)}, {
  minZoom: ${MAP_MIN_ZOOM}, maxZoom: 18, attribution: '&copy; OpenStreetMap'
}).addTo(map);
function text(value) { var el = document.createElement('span'); el.textContent = value; return el.innerHTML; }
function labelHtml(title, sub) { return '<b>' + text(title) + '</b>' + (sub ? '<small>' + text(sub) + '</small>' : ''); }
function post(message) {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
}
// Labels stay readable: all hidden below LABELS_MIN_ZOOM, and one that would
// cover a label of a higher rank (r0 СпецПласт16, r1 on the line, r2
// companies, r3 customers' orders, r4 «приём заявок») hidden until the map
// moves; a tap on its pin shows it («forced»).
function rankOf(el) {
  if (el.classList.contains('forced')) return -1;
  var m = / r(\\d)/.exec(' ' + el.className);
  return m ? Number(m[1]) : 9;
}
function declutter() {
  try {
    var box = map.getContainer();
    var off = map.getZoom() < LABELS_MIN_ZOOM;
    box.classList.toggle('labels-off', off);
    if (off) return;
    var els = Array.prototype.slice.call(box.querySelectorAll('.leaflet-tooltip'));
    els.sort(function (a, b) { return rankOf(a) - rankOf(b); });
    // Write, read all, write: one layout per pass; labels off the screen are skipped.
    els.forEach(function (el) { el.classList.remove('clash'); });
    var view = box.getBoundingClientRect();
    var rects = els.map(function (el) { return el.getBoundingClientRect(); });
    var placed = [];
    var clashing = [];
    function cross(a, b) { return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; }
    els.forEach(function (el, i) {
      var r = rects[i];
      if (!cross(view, r)) return;
      if (placed.some(function (p) { return cross(p, r); })) clashing.push(el); else placed.push(r);
    });
    clashing.forEach(function (el) { el.classList.add('clash'); });
  } catch (e) {}
}
function hiddenLabel(marker) {
  try {
    var tip = marker.getTooltip && marker.getTooltip();
    var el = tip && tip.getElement && tip.getElement();
    if (!el || el.classList.contains('forced')) return null;
    var off = map.getContainer().classList.contains('labels-off');
    return off || el.classList.contains('clash') ? el : null;
  } catch (e) { return null; }
}
// A tap on a pin whose label is hidden shows that label first.
function revealFirst(marker) {
  var el = hiddenLabel(marker);
  if (!el) return false;
  el.classList.add('forced');
  return true;
}
function unforce() {
  try {
    Array.prototype.slice.call(map.getContainer().querySelectorAll('.leaflet-tooltip.forced'))
      .forEach(function (el) { el.classList.remove('forced'); });
  } catch (e) {}
}
function km(a, b) {
  var rad = Math.PI / 180;
  var dLat = (b.lat - a.lat) * rad;
  var dLon = (b.lon - a.lon) * rad;
  var h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.pow(Math.sin(dLon / 2), 2);
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function send(pin) { post({ type: 'provider', id: pin.id, catalogUrl: pin.catalogUrl }); }
function postMachine(id) { if (id) post({ type: 'machine', equipmentId: id }); }
function samePlace(a, b) { return Math.abs(a.lat - b.lat) < 0.0005 && Math.abs(a.lon - b.lon) < 0.0005; }
function cardButton(label, cls, onTap) {
  var button = document.createElement('button');
  if (cls) button.className = cls;
  button.textContent = label;
  button.onclick = onTap;
  return button;
}
// A tapped pin is brought to the middle of the map, a little below the centre
// (CARD_SHIFT of the height), so its card has room above it and stays clear of
// the app's top bar; the card is never taller than CARD_MAX of the map and
// scrolls inside itself instead of moving the map again.
var CARD_SHIFT = 0.1;
var CARD_MAX = 0.4;
function popupOptions() {
  var max = 260;
  try { max = Math.max(180, Math.round(map.getSize().y * CARD_MAX)); } catch (e) {}
  return { maxHeight: max, autoPan: false };
}
function centreOn(latlng) {
  try {
    var point = map.project(latlng, map.getZoom());
    map.panTo(map.unproject([point.x, point.y - map.getSize().y * CARD_SHIFT], map.getZoom()));
  } catch (e) {
    try { map.panTo(latlng); } catch (e2) {}
  }
}
// «Кто рядом»: every pin is known by its key («provider:<id>»,
// «customer:<id>», «live:<id>»). Opening a card centres the map on the pin
// and asks the app for the nearest pins; the app answers window.showNearby.
var index = {};
function nearBox() { var el = document.createElement('div'); el.className = 'near'; return el; }
function register(keys, key, marker, near, hasCard) {
  index[key] = { marker: marker, near: near, card: hasCard };
  keys.push(key);
  if (hasCard) marker.on('popupopen', function () {
    centreOn(marker.getLatLng());
    post({ type: 'select', key: key });
  });
}
function forget(keys) { keys.forEach(function (key) { delete index[key]; }); keys.length = 0; }
function focusKey(key) {
  var entry = index[key];
  if (!entry) return;
  try {
    if (entry.card) { entry.marker.openPopup(); return; }
    map.panTo(entry.marker.getLatLng());
    revealFirst(entry.marker);
  } catch (e) {}
}
window.showNearby = function (key, items) {
  var entry = index[key];
  if (!entry || !entry.near) return;
  entry.near.innerHTML = '';
  if (items && items.length) {
    var head = document.createElement('b');
    head.textContent = 'Рядом';
    entry.near.appendChild(head);
    items.forEach(function (item) {
      var row = cardButton('', 'row', function () { focusKey(item.key); });
      row.innerHTML = '<span>' + text(item.title) + (item.sub ? '<small>' + text(item.sub) + '</small>' : '') +
        '</span><small>' + text(item.distance) + '</small>';
      entry.near.appendChild(row);
    });
  }
  try { var popup = entry.marker.getPopup(); if (popup && popup.update) popup.update(); } catch (e) {}
};
// Providers and customers' orders: redrawn by window.setPins when the app
// has the pins of a new viewport. A machine on the line gives the pin a green
// ring («on»); without one the pin is dimmed («off»), never removed.
var pinLayer = L.layerGroup().addTo(map);
var houseMarkers = [];
var pinKeys = [];
var baseGroups = [];
var liveMachines = [];
// The company's own pin is hidden while its machines stand at the same spot
// as one marker (on the line without GPS, or «на базе»): one pin, not two.
function syncHouse() {
  houseMarkers.forEach(function (h) {
    var covered = baseGroups.some(function (g) { return samePlace(g, h.pin); }) ||
      liveMachines.some(function (m) { return m.house && m.items && m.items.length > 1 && samePlace(m, h.pin); });
    if (covered && h.shown) { pinLayer.removeLayer(h.marker); h.shown = false; }
    if (!covered && !h.shown) { pinLayer.addLayer(h.marker); h.shown = true; }
  });
}
function pinCard(pin, near) {
  var box = document.createElement('div');
  box.className = 'card';
  box.innerHTML = '<b>' + text(pin.name) + '</b>' +
    (pin.house ? '<small>Парк СпецПласт16</small>' : '') +
    (pin.on === true ? '<small class="on">На линии</small>' : '') +
    (pin.city ? '<small>' + text(pin.city) + '</small>' : '') +
    '<small>' + text(pin.types || pin.machines) + '</small>' +
    (pin.price ? '<small class="price">' + text(pin.price) + '</small>' : '') +
    (pin.note ? '<small>' + text(pin.note) + '</small>' : '');
  if (pin.phone && pin.phoneHref) {
    box.appendChild(cardButton('Позвонить ' + pin.phone, 'call', function () { post({ type: 'call', href: pin.phoneHref }); }));
  } else if (pin.orderUrl) {
    box.appendChild(cardButton('Написать', 'call', function () { post({ type: 'write', orderUrl: pin.orderUrl }); }));
  }
  box.appendChild(cardButton('Техника исполнителя', '', function () { send(pin); }));
  box.appendChild(near);
  return box;
}
function renderPins() {
  forget(pinKeys);
  pinLayer.clearLayers();
  houseMarkers = [];
  customers.forEach(function (c) {
    var near = nearBox();
    var box = document.createElement('div');
    box.className = 'card';
    box.innerHTML = '<b>' + text(c.title) + '</b><small>' + text(c.sub) + '</small>' +
      '<small>Место показано примерно, без адреса</small>';
    if (c.orderUrl) {
      box.appendChild(cardButton('Открыть заявку', 'call', function () { post({ type: 'order', id: c.id, orderUrl: c.orderUrl }); }));
    }
    box.appendChild(near);
    var marker = L.marker([c.lat, c.lon], {
      icon: L.divIcon({ className: '', html: '<div class="pin cust">👷</div>', iconSize: [34, 34], iconAnchor: [17, 17] }),
      zIndexOffset: -100
    }).bindPopup(box, popupOptions());
    marker.bindTooltip(labelHtml(c.title, c.sub), { permanent: true, direction: 'top', offset: [0, -19], opacity: 1, className: 'lbl cust r3' });
    register(pinKeys, 'customer:' + c.id, marker, near, true);
    pinLayer.addLayer(marker);
  });
  pins.slice().reverse().forEach(function (pin) {
    var state = pin.on === true ? ' on' : pin.on === false ? ' off' : '';
    var icon = L.divIcon({
      className: '',
      html: '<div class="pin' + (pin.house ? ' house' : '') + state + '">' + (pin.house ? 'СП' : text(pin.machines.split(' ')[0])) + '</div>',
      iconSize: pin.house ? [40, 40] : [34, 34],
      iconAnchor: pin.house ? [20, 20] : [17, 17]
    });
    var near = nearBox();
    var marker = L.marker([pin.lat, pin.lon], { icon: icon, zIndexOffset: pin.house ? 1000 : pin.on === true ? 100 : 0 })
      .bindPopup(pinCard(pin, near), popupOptions());
    marker.bindTooltip(labelHtml(pin.label.title, pin.label.sub), { permanent: true, direction: 'top', offset: [0, pin.house ? -22 : -19], opacity: 1, className: 'lbl ' + (pin.house ? 'house r0' : 'r2') });
    register(pinKeys, 'provider:' + pin.id, marker, near, true);
    if (pin.house) houseMarkers.push({ pin: pin, marker: marker, shown: false });
    else pinLayer.addLayer(marker);
  });
  syncHouse();
}
renderPins();
var bounds = pins.map(function (pin) { return [pin.lat, pin.lon]; });
if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
else if (bounds.length === 1) map.setView(bounds[0], 10);
// New pins never close a card the user is reading: they wait for it to close.
var cardOpen = false;
var pendingPins = null;
function applyPins(next) {
  pins = next.pins || [];
  customers = next.customers || [];
  renderPins();
  declutter();
}
window.setPins = function (nextPins, nextCustomers) {
  var next = { pins: nextPins, customers: nextCustomers };
  if (cardOpen) { pendingPins = next; return; }
  applyPins(next);
};
map.on('popupopen', function () { cardOpen = true; });
map.on('popupclose', function () {
  cardOpen = false;
  // Not at once: moving from one card to another closes the first one first.
  setTimeout(function () {
    if (cardOpen || !pendingPins) return;
    var next = pendingPins;
    pendingPins = null;
    applyPins(next);
  }, 0);
});
// The viewport after a move, once the map has been still for BBOX_DEBOUNCE_MS:
// the app asks the server for the pins of this window (?bbox=).
var bboxTimer = null;
map.on('moveend', function () {
  if (bboxTimer) clearTimeout(bboxTimer);
  bboxTimer = setTimeout(function () {
    try {
      var b = map.getBounds();
      post({ type: 'bbox', south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    } catch (e) {}
  }, BBOX_DEBOUNCE_MS);
});
// «На линии»: the app pushes the machines on the line (window.setLive) and
// the customer's own position (window.setMe); each machine is a green pin
// with a bubble: a small «Я на линии» line, then «машина · цена · имя» and
// the driver's note. Bubbles that would cover others hide (declutter); a tap
// on a pin shows its hidden bubble first, a tap on a pin whose bubble shows
// sends {type:'machine', equipmentId} to the app. Machines without GPS that
// stand at one point (СпецПласт16's fleet at its base, always on the line)
// come as ONE entry with «items»: a bigger pin «N машин на линии» that opens
// the list of machines.
var liveLayer = L.layerGroup().addTo(map);
var meMarker = null;
var liveKeys = [];
function bubbleHtml(m) {
  return '<small>' + text(m.head) + '</small>' + text(m.body) +
    (m.note ? '<span class="note">' + text(m.note) + '</span>' : '');
}
// The card of several machines at one point: each row opens the machine.
function groupCard(g, near) {
  var box = document.createElement('div');
  box.className = 'card';
  box.innerHTML = '<b>' + text(g.title || g.head) + '</b>';
  var list = document.createElement('div');
  list.className = 'list';
  g.items.forEach(function (item) {
    var row = cardButton('', 'row', function () { postMachine(item.equipmentId); });
    row.innerHTML = '<span>' + text(item.name) + '</span><small>' + text(item.price) + '</small>';
    list.appendChild(row);
  });
  box.appendChild(list);
  var house = g.house === false ? null : houseMarkers.filter(function (h) { return samePlace(g, h.pin); })[0];
  if (house) {
    if (house.pin.phone && house.pin.phoneHref) {
      box.appendChild(cardButton('Позвонить ' + house.pin.phone, 'call', function () { post({ type: 'call', href: house.pin.phoneHref }); }));
    }
    box.appendChild(cardButton('Вся техника СпецПласт16', '', function () { send(house.pin); }));
  }
  if (near) box.appendChild(near);
  return box;
}
function renderLive() {
  forget(liveKeys);
  liveLayer.clearLayers();
  liveMachines.forEach(function (m) {
    var many = !!(m.items && m.items.length > 1);
    var icon = L.divIcon({
      className: '',
      html: '<div class="pin live' + (m.house ? ' house' : '') + (many ? ' base' : '') + '">' + text(m.short) + '</div>',
      iconSize: many ? [44, 44] : [34, 34], iconAnchor: many ? [22, 22] : [17, 17]
    });
    var marker = L.marker([m.lat, m.lon], { icon: icon, zIndexOffset: 1500 });
    if (many) {
      var near = nearBox();
      marker.bindPopup(groupCard(m, near), popupOptions());
      if (m.key) register(liveKeys, m.key, marker, near, true);
    } else {
      // Registered before bindTooltip, so the bubble's state is the one
      // before Leaflet's own click handler.
      marker.on('click', function () {
        if (revealFirst(marker)) return;
        postMachine(m.equipmentId);
      });
      if (m.key) register(liveKeys, m.key, marker, null, false);
    }
    marker.bindTooltip(bubbleHtml(m), { permanent: true, direction: 'top', offset: [0, many ? -24 : -18], opacity: 1, className: 'bubble' + (m.house ? ' house r0' : ' r1') });
    liveLayer.addLayer(marker);
  });
}
window.setLive = function (machines) {
  liveMachines = machines || [];
  renderLive();
  syncHouse();
  placeIntake();
  declutter();
};
map.on('movestart', unforce);
map.on('zoomend moveend', declutter);
// СпецПласт16's free machines at the base (window.setBase, lib/line.ts
// toBasePins): one pin per base with a bubble «СпецПласт16 · на базе» over
// «машина · от N ₽/ч» (or «N машин · от …»). One machine opens its page on
// tap; several open a list. Since 2026-11-11 the server sends the fleet as
// machines on the line and this list is empty: then nothing is drawn here
// and the company's own pin stays as it is.
var baseLayer = L.layerGroup().addTo(map);
window.setBase = function (groups) {
  baseGroups = groups || [];
  baseLayer.clearLayers();
  syncHouse();
  baseGroups.forEach(function (g) {
    var many = g.items.length > 1;
    var icon = L.divIcon({
      className: '',
      html: '<div class="pin house base">' + (many ? 'СП·' + g.items.length : 'СП') + '</div>',
      iconSize: [44, 44], iconAnchor: [22, 22]
    });
    var marker = L.marker([g.lat, g.lon], { icon: icon, zIndexOffset: 1200 });
    if (many) {
      marker.bindPopup(groupCard(g, null));
    } else {
      // As with live machines: a hidden bubble opens first, then the page.
      marker.on('click', function () {
        if (revealFirst(marker)) return;
        postMachine(g.items[0] && g.items[0].equipmentId);
      });
    }
    marker.bindTooltip(bubbleHtml({ head: g.head, body: g.body, note: null }), { permanent: true, direction: 'top', offset: [0, -24], opacity: 1, className: 'bubble house r0' });
    baseLayer.addLayer(marker);
  });
  declutter();
};
// «Приём заявок» (owner, 2026-10-18): the platform's points in big cities
// with no provider near (the server leaves those out); one also hides while a
// machine on the line is within INTAKE_CLEAR_KM. A tap sends
// {type:'intake', city}: the app opens a new order with that city.
var intakeMarkers = intake.map(function (p) {
  var marker = L.marker([p.lat, p.lon], {
    icon: L.divIcon({ className: '', html: '<div class="pin intake">📝</div>', iconSize: [34, 34], iconAnchor: [17, 17] }),
    zIndexOffset: -200
  });
  marker.on('click', function () {
    if (revealFirst(marker)) return;
    post({ type: 'intake', city: p.city });
  });
  marker.bindTooltip(labelHtml(p.title, p.text), { permanent: true, direction: 'top', offset: [0, -19], opacity: 1, className: 'lbl intake r4' });
  return { point: p, marker: marker, shown: false };
});
function placeIntake() {
  intakeMarkers.forEach(function (item) {
    var taken = liveMachines.some(function (m) { return km(item.point, m) <= INTAKE_CLEAR_KM; });
    if (taken && item.shown) { map.removeLayer(item.marker); item.shown = false; }
    if (!taken && !item.shown) { item.marker.addTo(map); item.shown = true; }
  });
}
placeIntake();
setTimeout(declutter, 0);
window.setMe = function (point, center) {
  if (!point) return;
  if (!meMarker) {
    meMarker = L.marker([point.lat, point.lon], { icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 3000, interactive: false }).addTo(map);
  } else {
    meMarker.setLatLng([point.lat, point.lon]);
  }
  if (center) map.setView([point.lat, point.lon], Math.max(map.getZoom(), 12));
};
// «Вызвать сюда»: a tap on the map marks the work site and sends the point
// to the order sheet ({type:'point', lat, lon}).
var picked = null;
map.on('click', function (e) {
  var lat = Math.round(e.latlng.lat * 100000) / 100000;
  var lon = Math.round(e.latlng.lng * 100000) / 100000;
  if (!picked) {
    picked = L.marker([lat, lon], { icon: L.divIcon({ className: '', html: '<div class="pin site">📍</div>', iconSize: [34, 34], iconAnchor: [17, 34] }), zIndexOffset: 2000 }).addTo(map);
  } else {
    picked.setLatLng([lat, lon]);
  }
  post({ type: 'point', lat: lat, lon: lon });
});
</script>
</body></html>`;
}
