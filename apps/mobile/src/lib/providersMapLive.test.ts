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
      removeLayer: () => log.push('remove'),
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
  // Many machines: every bubble is still a permanent label; overlapping ones
  // are hidden by the page's declutter, not turned into tap-only bubbles.
  setLive(Array.from({ length: 9 }, () => pin));
  expect(log.filter((l) => l === 'tooltip permanent=true')).toHaveLength(12);
  expect(log.filter((l) => l === 'tooltip permanent=false')).toHaveLength(0);
  expect(() => setMe({ lat: 55.7, lon: 52.4 }, true)).not.toThrow();
  expect(() => setMe({ lat: 55.71, lon: 52.41 }, false)).not.toThrow();
});

it('hides a «приём заявок» point once a machine on the line is near it', () => {
  const html = providersMapHtml(
    [],
    { primary: '#E0560B', dark: '#222', onDark: '#fff', text: '#111' },
    [
      {
        city: 'Казань',
        lat: 55.79,
        lon: 49.1,
        title: 'ИИСтройка24 · приём заявок',
        text: 'Казань',
      },
    ],
  );
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)[0]!;
  const log: string[] = [];
  const win: Record<string, unknown> = {};
  const doc = { createElement: () => ({ innerHTML: '', appendChild: () => undefined }) };
  new Function('L', 'window', 'document', script)(leafletStub(log), win, doc);
  const setLive = win.setLive as (m: unknown[]) => void;
  expect(log).not.toContain('remove');
  setLive([
    {
      equipmentId: 'e1',
      lat: 55.8,
      lon: 49.12,
      short: 'JCB',
      head: 'Я на линии',
      body: '',
      note: null,
      house: false,
    },
  ]);
  expect(log).toContain('remove');
});
