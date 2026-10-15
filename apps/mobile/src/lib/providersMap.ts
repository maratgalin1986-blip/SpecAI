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

/** Набережные Челны — центр карты, пока точек нет. */
export const MAP_CENTER = { lat: 55.7436, lon: 52.3958 } as const;

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
 * Страница карты: маркеры компаний, СпецПласт16 выделен цветом бренда.
 * Нажатие «Техника исполнителя» отправляет в приложение
 * {type:'provider', id, catalogUrl} через ReactNativeWebView.postMessage.
 */
export function providersMapHtml(
  pins: ProviderPin[],
  colors: { primary: string; dark: string; onDark: string; text: string },
): string {
  const data = sortPins(pins).map((pin) => ({
    id: pin.id,
    name: pin.name,
    lat: pin.lat,
    lon: pin.lon,
    note: pin.note,
    house: pin.isHouse,
    machines: machinesLabel(pin.equipmentCount),
    catalogUrl: pin.catalogUrl,
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
.leaflet-tooltip.bubble{background:#fff;color:${colors.text};border:0;border-radius:14px;padding:6px 10px;
font:600 12px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25);white-space:normal;max-width:220px}
.leaflet-tooltip.bubble.house{border:2px solid ${colors.primary}}
.card{min-width:180px;color:${colors.text}}
.card b{display:block;font-size:15px;margin-bottom:2px}
.card small{display:block;color:#5f6b73;margin:2px 0}
.card button{margin-top:8px;width:100%;min-height:40px;border:0;border-radius:20px;
background:${colors.dark};color:${colors.onDark};font:700 14px sans-serif}
</style>
</head><body>
<div id="map"></div>
<script src="${LEAFLET}/leaflet.js"></script>
<script>
var pins = ${scriptJson(data)};
var map = L.map('map', { zoomControl: false, attributionControl: true })
  .setView([${MAP_CENTER.lat}, ${MAP_CENTER.lon}], 10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18, attribution: '&copy; OpenStreetMap'
}).addTo(map);
function text(value) { var el = document.createElement('span'); el.textContent = value; return el.innerHTML; }
function send(pin) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'provider', id: pin.id, catalogUrl: pin.catalogUrl }));
  }
}
var bounds = [];
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
  L.marker([pin.lat, pin.lon], { icon: icon, zIndexOffset: pin.house ? 1000 : 0 })
    .addTo(map).bindPopup(box);
  bounds.push([pin.lat, pin.lon]);
});
if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
// «На линии»: the app pushes the fresh online machines (window.setLive) and
// the customer's own position (window.setMe); each machine is a green pin
// with a bubble «Я на линии · машина · цена · имя». A tap on the pin sends
// {type:'machine', equipmentId} to the app.
var liveLayer = L.layerGroup().addTo(map);
var meMarker = null;
window.setLive = function (machines) {
  liveLayer.clearLayers();
  (machines || []).forEach(function (m) {
    var icon = L.divIcon({
      className: '',
      html: '<div class="pin live' + (m.house ? ' house' : '') + '">' + text(m.short) + '</div>',
      iconSize: [34, 34], iconAnchor: [17, 17]
    });
    var marker = L.marker([m.lat, m.lon], { icon: icon, zIndexOffset: 1500 })
      .bindTooltip(text(m.bubble), { permanent: true, direction: 'top', offset: [0, -18], className: 'bubble' + (m.house ? ' house' : '') });
    marker.on('click', function () {
      if (window.ReactNativeWebView && m.equipmentId) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'machine', equipmentId: m.equipmentId }));
      }
    });
    liveLayer.addLayer(marker);
  });
};
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
