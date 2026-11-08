import { describe, expect, it } from 'vitest';
import type { BaseMachine } from './api';
import { splitBaseBubble, toBasePins } from './line';
import { providersMapHtml } from './providersMap';

const machine = (id: string, name: string, rate: number, at = { lat: 55.7436, lon: 52.3959 }) =>
  ({
    id,
    ...at,
    company: { name: 'СпецПласт16', isHouse: true },
    equipment: {
      id,
      name,
      category: 'Экскаваторы-погрузчики',
      categorySlug: 'backhoe-loaders',
      hourlyRate: rate,
      dailyRate: rate * 8,
    },
    priceText: `от ${rate} ₽/ч`,
    distanceKm: 1,
    bubble: `СпецПласт16 · ${name} · от ${rate} ₽/ч · на базе`,
  }) satisfies BaseMachine;

describe('house machines at the base', () => {
  it('one machine: «СпецПласт16 · на базе» over «машина · цена», never «Я на линии»', () => {
    const [pin] = toBasePins([machine('e1', 'JCB 3CX', 2500)]);
    expect(pin).toMatchObject({
      head: 'СпецПласт16 · на базе',
      body: 'JCB 3CX · от 2500 ₽/ч',
      items: [{ equipmentId: 'e1', name: 'JCB 3CX', price: 'от 2500 ₽/ч' }],
    });
    expect(JSON.stringify(pin)).not.toContain('Я на линии');
  });

  it('machines of one base are one pin with the count and the lowest price', () => {
    const pins = toBasePins([
      machine('e1', 'JCB 3CX', 2500),
      machine('e2', 'Автокран 25 т', 3500),
      machine('e3', 'Каток', 1800),
      machine('far', 'Погрузчик', 2000, { lat: 55.79, lon: 49.11 }),
    ]);
    expect(pins).toHaveLength(2);
    expect(pins[0]?.body).toBe('3 машины · от 1800 ₽/ч');
    expect(pins[0]?.items.map((item) => item.equipmentId)).toEqual(['e1', 'e2', 'e3']);
    expect(pins[1]?.items).toHaveLength(1);
  });

  it('splits the server bubble', () => {
    expect(splitBaseBubble('СпецПласт16 · JCB · от 1 ₽/ч · на базе')).toEqual({
      head: 'СпецПласт16 · на базе',
      body: 'JCB · от 1 ₽/ч',
    });
  });
});

it('map script: setBase draws the base and hides the company pin at the same spot', () => {
  const log: string[] = [];
  const chain = () => {
    const obj: Record<string, unknown> = {};
    const self = () => obj;
    Object.assign(obj, {
      addTo: () => {
        log.push('addTo');
        return obj;
      },
      on: self,
      setView: self,
      fitBounds: self,
      bindPopup: () => {
        log.push('popup');
        return obj;
      },
      setLatLng: self,
      getZoom: () => 10,
      getBounds: () => ({ contains: () => true }),
      clearLayers: () => log.push('clear'),
      addLayer: () => log.push('add'),
      removeLayer: () => log.push('remove'),
      isTooltipOpen: () => false,
      bindTooltip: (html: string) => {
        log.push(`tooltip ${html}`);
        return obj;
      },
    });
    return obj;
  };
  const leaflet = {
    map: chain,
    tileLayer: chain,
    marker: chain,
    layerGroup: chain,
    divIcon: () => ({}),
  };
  const html = providersMapHtml(
    [
      {
        id: 'specplast16-house',
        name: 'СпецПласт16',
        lat: 55.7436,
        lon: 52.3959,
        note: null,
        imageUrl: null,
        equipmentCount: 3,
        isHouse: true,
        catalogUrl: '/equipment?company=specplast16-house',
      },
    ],
    { primary: '#E0560B', dark: '#222', onDark: '#fff', text: '#111' },
  );
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)[0]!;
  const win: Record<string, unknown> = {};
  const doc = {
    createElement: () => ({
      set textContent(value: string) {
        this.innerHTML = value;
      },
      innerHTML: '',
      className: '',
      appendChild: () => undefined,
    }),
  };
  new Function('L', 'window', 'document', script)(leaflet, win, doc);
  const setBase = win.setBase as (groups: unknown[]) => void;
  setBase(toBasePins([machine('e1', 'JCB 3CX', 2500), machine('e2', 'Каток', 1800)]));
  expect(log).toContain('remove');
  expect(
    log.some((line) => line.startsWith('tooltip <small>СпецПласт16 · на базе</small>2 машины')),
  ).toBe(true);
  // Without base machines the company pin comes back.
  log.length = 0;
  setBase([]);
  expect(log).toContain('addTo');
});
