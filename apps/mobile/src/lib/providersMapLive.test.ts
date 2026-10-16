import { expect, it } from 'vitest';
import { providersMapHtml } from './providersMap';

/** A tiny Leaflet stand-in: enough to run the page script and the live layer. */
function leafletStub(log: string[]) {
  const chain = () => {
    const obj: Record<string, unknown> = {};
    const self = () => obj;
    Object.assign(obj, {
      addTo: self,
      on: self,
      setView: self,
      fitBounds: self,
      bindPopup: self,
      setLatLng: self,
      getZoom: () => 10,
      getBounds: () => ({ contains: () => true }),
      clearLayers: () => log.push('clear'),
      addLayer: () => log.push('add'),
      isTooltipOpen: () => false,
      bindTooltip: (_html: string, options: { permanent: boolean }) => {
        log.push(`tooltip permanent=${options.permanent}`);
        return obj;
      },
    });
    return obj;
  };
  return {
    map: chain,
    tileLayer: chain,
    marker: chain,
    layerGroup: chain,
    divIcon: () => ({}),
  };
}

it('map script runs, setLive and setMe work', () => {
  const html = providersMapHtml([], {
    primary: '#E0560B',
    dark: '#222',
    onDark: '#fff',
    text: '#111',
  });
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)[0]!;
  const log: string[] = [];
  const win: Record<string, unknown> = {};
  const doc = {
    createElement: () => ({
      set textContent(value: string) {
        this.innerHTML = value;
      },
      innerHTML: '',
      appendChild: () => undefined,
    }),
  };
  new Function('L', 'window', 'document', script)(leafletStub(log), win, doc);
  const setLive = win.setLive as (m: unknown[]) => void;
  const setMe = win.setMe as (p: unknown, c: boolean) => void;
  const pin = {
    equipmentId: 'e1',
    lat: 55.7,
    lon: 52.4,
    short: 'Экска.',
    head: 'Я на линии',
    body: 'JCB · от 4 000 ₽/ч · Марат Г.',
    note: null,
    house: false,
  };
  setLive(Array.from({ length: 3 }, () => pin));
  expect(log.filter((l) => l === 'tooltip permanent=true')).toHaveLength(3);
  setLive(Array.from({ length: 9 }, () => pin));
  expect(log.filter((l) => l === 'tooltip permanent=false')).toHaveLength(9);
  expect(() => setMe({ lat: 55.7, lon: 52.4 }, true)).not.toThrow();
  expect(() => setMe({ lat: 55.71, lon: 52.41 }, false)).not.toThrow();
});
