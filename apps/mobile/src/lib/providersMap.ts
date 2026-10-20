/**
 * Карта исполнителей в приложении: точки баз компаний из GET /api/providers/map
 * (публичные поля, без телефонов и адресов) на Leaflet + OpenStreetMap во
 * WebView. Здесь — чистая сборка HTML-страницы карты, покрыта тестами
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

/** Подпись над точкой компании: название и число машин; у парка — «СпецПласт16». */
export function pinLabel(pin: Pick<ProviderPin, 'name' | 'equipmentCount' | 'isHouse'>): {
  title: string;
  sub: string;
} {
  const machines = machinesLabel(pin.equipmentCount);
  if (pin.isHouse) return { title: HOUSE_LABEL, sub: `свой парк · ${machines}` };
  const name = pin.name.replace(/\s+/g, ' ').trim();
  return { title: name.length > 28 ? `${name.slice(0, 27).trimEnd()}…` : name, sub: machines };
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
 * компании, точки «приём заявок»); скрытая подпись открывается нажатием.
 * Нажатие «Техника исполнителя» отправляет в приложение
 * {type:'provider', id, catalogUrl} через ReactNativeWebView.postMessage,
 * точка «приём заявок» — {type:'intake', city}.
 */
export function providersMapHtml(
  pins: ProviderPin[],
  colors: { primary: string; dark: string; onDark: string; text: string },
  intake: IntakePin[] = [],
): string {
  const data = sortPins(pins).map((pin) => ({
    id: pin.id,
    name: pin.name,
    lat: pin.lat,
    lon: pin.lon,
    note: pin.note,
    house: pin.isHouse,
    machines: machinesLabel(pin.equipmentCount),
    label: pinLabel(pin),
    catalogUrl: pin.catalogUrl,
  }));
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
.leaflet-tooltip.lbl.intake{border:1px dashed #b45309;background:#fffbeb}
.pin.intake{background:#fffbeb;color:#b45309;border:2px dashed #b45309;font-size:16px}
.labels-off .leaflet-tooltip,.leaflet-tooltip.clash{visibility:hidden}
.leaflet-tooltip.forced{visibility:visible;z-index:700}
.card{min-width:180px;color:${colors.text}}
.card b{display:block;font-size:15px;margin-bottom:2px}
.card small{display:block;color:#5f6b73;margin:2px 0}
.card button{margin-top:8px;width:100%;min-height:40px;border:0;border-radius:20px;
background:${colors.dark};color:${colors.onDark};font:700 14px sans-serif}
.pin.base{width:44px;height:44px;border-radius:22px;font-size:12px}
.card .list{max-height:240px;overflow-y:auto;margin-top:4px}
.card button.row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;
background:#f3f4f6;color:${colors.text};border-radius:12px;padding:6px 10px;text-align:left;font:600 13px sans-serif}
.card button.row small{margin:0;white-space:nowrap}
</style>
</head><body>
<div id="map"></div>
<script src="${LEAFLET}/leaflet.js"></script>
<script>
var pins = ${scriptJson(data)};
var intake = ${scriptJson(intakeData)};
var LABELS_MIN_ZOOM = ${LABELS_MIN_ZOOM};
var INTAKE_CLEAR_KM = ${INTAKE_CLEAR_KM};
var map = L.map('map', { zoomControl: false, attributionControl: true })
  .setView([${MAP_CENTER.lat}, ${MAP_CENTER.lon}], ${MAP_OVERVIEW_ZOOM});
L.tileLayer(${JSON.stringify(TILES_URL)}, {
  minZoom: ${MAP_MIN_ZOOM}, maxZoom: 18, attribution: '&copy; OpenStreetMap'
}).addTo(map);
function text(value) { var el = document.createElement('span'); el.textContent = value; return el.innerHTML; }
function labelHtml(title, sub) { return '<b>' + text(title) + '</b>' + (sub ? '<small>' + text(sub) + '</small>' : ''); }
// Labels stay readable: all hidden below LABELS_MIN_ZOOM, and one that would
// cover a label of a higher rank (r0 СпецПласт16, r1 on the line, r2
// companies, r3 «приём заявок») hidden until the map moves; a tap on its pin
// shows it («forced»).
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
function send(pin) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'provider', id: pin.id, catalogUrl: pin.catalogUrl }));
  }
}
var bounds = [];
var houseMarkers = [];
pins.slice().reverse().forEach(function (pin) {
  var icon = L.divIcon({
    className: '',
    html: '<div class="pin' + (pin.house ? ' house' : '') + '">' + (pin.house ? 'СП' : text(pin.machines.split(' ')[0])) + '</div>',
    iconSize: pin.house ? [40, 40] : [34, 34],
    iconAnchor: pin.house ? [20, 20] : [17, 17]
  });
  var box = document.createElement('div');
  box.className = 'card';
  box.innerHTML = '<b>' + text(pin.name) + '</b>' +
    (pin.house ? '<small>Парк СпецПласт16</small>' : '') +
    '<small>' + text(pin.machines) + '</small>' +
    (pin.note ? '<small>' + text(pin.note) + '</small>' : '');
  var button = document.createElement('button');
  button.textContent = 'Техника исполнителя';
  button.onclick = function () { send(pin); };
  box.appendChild(button);
  var marker = L.marker([pin.lat, pin.lon], { icon: icon, zIndexOffset: pin.house ? 1000 : 0 })
    .addTo(map).bindPopup(box);
  marker.bindTooltip(labelHtml(pin.label.title, pin.label.sub), { permanent: true, direction: 'top', offset: [0, pin.house ? -22 : -19], opacity: 1, className: 'lbl ' + (pin.house ? 'house r0' : 'r2') });
  if (pin.house) houseMarkers.push({ pin: pin, marker: marker, shown: true });
  bounds.push([pin.lat, pin.lon]);
});
if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
else if (bounds.length === 1) map.setView(bounds[0], 10);
// «На линии»: the app pushes the fresh online machines (window.setLive) and
// the customer's own position (window.setMe); each machine is a green pin
// with a bubble: a small «Я на линии» line, then «машина · цена · имя» and
// the driver's note. Bubbles that would cover others hide (declutter); a tap
// on a pin shows its hidden bubble first, a tap on a pin whose bubble shows
// sends {type:'machine', equipmentId} to the app.
var liveLayer = L.layerGroup().addTo(map);
var meMarker = null;
var liveMachines = [];
function bubbleHtml(m) {
  return '<small>' + text(m.head) + '</small>' + text(m.body) +
    (m.note ? '<span class="note">' + text(m.note) + '</span>' : '');
}
function renderLive() {
  liveLayer.clearLayers();
  liveMachines.forEach(function (m) {
    var icon = L.divIcon({
      className: '',
      html: '<div class="pin live' + (m.house ? ' house' : '') + '">' + text(m.short) + '</div>',
      iconSize: [34, 34], iconAnchor: [17, 17]
    });
    var marker = L.marker([m.lat, m.lon], { icon: icon, zIndexOffset: 1500 });
    // Registered before bindTooltip, so isTooltipOpen() is the state before
    // Leaflet's own click handler opens the bubble.
    marker.on('click', function () {
      if (revealFirst(marker)) return;
      if (window.ReactNativeWebView && m.equipmentId) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'machine', equipmentId: m.equipmentId }));
      }
    });
    marker.bindTooltip(bubbleHtml(m), { permanent: true, direction: 'top', offset: [0, -18], opacity: 1, className: 'bubble' + (m.house ? ' house r0' : ' r1') });
    liveLayer.addLayer(marker);
  });
}
window.setLive = function (machines) {
  liveMachines = machines || [];
  renderLive();
  placeIntake();
  declutter();
};
map.on('movestart', unforce);
map.on('zoomend moveend', declutter);
// СпецПласт16's free machines at the base (window.setBase, lib/line.ts
// toBasePins): one pin per base with a bubble «СпецПласт16 · на базе» over
// «машина · от N ₽/ч» (or «N машин · от …»). One machine opens its page on
// tap; several open a list. The company's own pin at the same spot is
// hidden while its machines stand there. Bubbles that would cover others
// hide (declutter) and show on tap.
var baseLayer = L.layerGroup().addTo(map);
function samePlace(a, b) { return Math.abs(a.lat - b.lat) < 0.0005 && Math.abs(a.lon - b.lon) < 0.0005; }
function postMachine(id) {
  if (window.ReactNativeWebView && id) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'machine', equipmentId: id }));
  }
}
window.setBase = function (groups) {
  groups = groups || [];
  baseLayer.clearLayers();
  houseMarkers.forEach(function (h) {
    var covered = groups.some(function (g) { return samePlace(g, h.pin); });
    if (covered && h.shown) { map.removeLayer(h.marker); h.shown = false; }
    if (!covered && !h.shown) { h.marker.addTo(map); h.shown = true; }
  });
  groups.forEach(function (g) {
    var many = g.items.length > 1;
    var icon = L.divIcon({
      className: '',
      html: '<div class="pin house base">' + (many ? 'СП·' + g.items.length : 'СП') + '</div>',
      iconSize: [44, 44], iconAnchor: [22, 22]
    });
    var marker = L.marker([g.lat, g.lon], { icon: icon, zIndexOffset: 1200 });
    if (many) {
      var box = document.createElement('div');
      box.className = 'card';
      box.innerHTML = '<b>' + text(g.head) + '</b>';
      var list = document.createElement('div');
      list.className = 'list';
      g.items.forEach(function (item) {
        var row = document.createElement('button');
        row.className = 'row';
        row.innerHTML = '<span>' + text(item.name) + '</span><small>' + text(item.price) + '</small>';
        row.onclick = function () { postMachine(item.equipmentId); };
        list.appendChild(row);
      });
      box.appendChild(list);
      var house = houseMarkers.filter(function (h) { return samePlace(g, h.pin); })[0];
      if (house) {
        var all = document.createElement('button');
        all.textContent = 'Вся техника СпецПласт16';
        all.onclick = function () { send(house.pin); };
        box.appendChild(all);
      }
      marker.bindPopup(box);
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
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'intake', city: p.city }));
    }
  });
  marker.bindTooltip(labelHtml(p.title, p.text), { permanent: true, direction: 'top', offset: [0, -19], opacity: 1, className: 'lbl intake r3' });
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
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'point', lat: lat, lon: lon }));
  }
});
</script>
</body></html>`;
}
