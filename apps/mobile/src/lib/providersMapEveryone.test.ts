import { describe, expect, it } from 'vitest';
import {
  bboxParam,
  mapSwitchOn,
  mergeInBox,
  pinLabel,
  pinMachinesText,
  providersMapHtml,
  safeSitePath,
  safeTel,
  toPageCustomers,
  toPagePins,
  type CustomerPin,
  type ProviderPin,
} from './providersMap';

const COLORS = { primary: '#E0560B', dark: '#222', onDark: '#fff', text: '#111' };

const pin = (over: Partial<ProviderPin>): ProviderPin => ({
  id: 'c1',
  name: 'Стройтех',
  lat: 55.7,
  lon: 52.4,
  note: null,
  imageUrl: null,
  equipmentCount: 4,
  isHouse: false,
  catalogUrl: '/providers/c1',
  machines: ['Экскаваторы', 'Самосвалы', 'Автокраны'],
  machinesMore: 2,
  city: 'Набережные Челны',
  priceText: 'от 24\u00a0000\u00a0₽/смена',
  phone: '+7 927 242-80-88',
  phoneHref: 'tel:+79272428088',
  onLine: true,
  orderUrl: '/orders?provider=c1',
  ...over,
});

const customer = (over: Partial<CustomerPin> = {}): CustomerPin => ({
  id: 'o1',
  lat: 55.76,
  lon: 52.43,
  title: 'Заказчик рядом',
  sub: 'нужно: Экскаваторы · Анна П.',
  machinery: 'Экскаваторы',
  customer: 'Анна П.',
  orderUrl: '/orders/o1',
  approximate: true,
  ...over,
});

interface FakeElement {
  tag: string;
  className: string;
  innerHTML: string;
  textContent: string;
  onclick: (() => void) | null;
  children: FakeElement[];
  appendChild: (child: FakeElement) => void;
}

interface FakeMarker {
  at: [number, number];
  icon: { html: string };
  popup: FakeElement | null;
  tooltip: string;
  handlers: Record<string, (() => void)[]>;
  fire: (event: string) => void;
}

/** Leaflet and a document small enough to run the page script and read what it drew. */
function runPage(html: string) {
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!)[0]!;
  const messages: Record<string, unknown>[] = [];
  const mapHandlers: Record<string, (() => void)[]> = {};
  const panned: unknown[] = [];

  const element = (tag: string): FakeElement => {
    let html = '';
    const el: FakeElement = {
      tag,
      className: '',
      onclick: null,
      children: [],
      appendChild: (child) => void el.children.push(child),
      get innerHTML() {
        return html;
      },
      // As the browser: new markup replaces the children.
      set innerHTML(value: string) {
        html = value;
        el.children.length = 0;
      },
      get textContent() {
        return html;
      },
      // As the browser: text set through textContent comes back escaped in innerHTML.
      set textContent(value: string) {
        el.innerHTML = String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;');
      },
    };
    return el;
  };

  const layer = () => {
    const markers = new Set<FakeMarker>();
    const group = {
      addTo: () => group,
      addLayer: (marker: FakeMarker) => void markers.add(marker),
      removeLayer: (marker: FakeMarker) => void markers.delete(marker),
      clearLayers: () => markers.clear(),
      markers,
    };
    return group;
  };
  const layers: ReturnType<typeof layer>[] = [];

  const map = {
    setView: () => map,
    fitBounds: () => map,
    addTo: () => map,
    panTo: (at: unknown) => void panned.push(at),
    getZoom: () => 10,
    getSize: () => ({ x: 360, y: 700 }),
    getBounds: () => ({
      getSouth: () => 55.1,
      getWest: () => 51.9,
      getNorth: () => 56.2,
      getEast: () => 53,
    }),
    getContainer: () => {
      throw new Error('no DOM in the test');
    },
    removeLayer: () => undefined,
    on: (events: string, handler: () => void) => {
      for (const event of events.split(' ')) (mapHandlers[event] ??= []).push(handler);
      return map;
    },
  };

  const L = {
    map: () => map,
    tileLayer: () => ({ addTo: () => undefined }),
    layerGroup: () => {
      const group = layer();
      layers.push(group);
      return group;
    },
    divIcon: (options: { html: string }) => ({ html: options.html }),
    marker: (at: [number, number], options: { icon: { html: string } }) => {
      const marker: FakeMarker & Record<string, unknown> = {
        at,
        icon: options.icon,
        popup: null,
        tooltip: '',
        handlers: {},
        fire: (event) => (marker.handlers[event] ?? []).forEach((handler) => handler()),
        on: (event: string, handler: () => void) => {
          (marker.handlers[event] ??= []).push(handler);
          return marker;
        },
        bindPopup: (box: FakeElement) => {
          marker.popup = box;
          return marker;
        },
        bindTooltip: (label: string) => {
          marker.tooltip = label;
          return marker;
        },
        openPopup: () => marker.fire('popupopen'),
        getPopup: () => ({ update: () => undefined }),
        getLatLng: () => ({ lat: at[0], lng: at[1] }),
        addTo: () => marker,
        setLatLng: () => marker,
      };
      return marker;
    },
  };

  const win: Record<string, unknown> = {
    ReactNativeWebView: {
      postMessage: (raw: string) => messages.push(JSON.parse(raw) as Record<string, unknown>),
    },
  };
  new Function('L', 'window', 'document', script)(L, win, {
    createElement: (tag: string) => element(tag),
  });

  const all = () => layers.flatMap((group) => [...group.markers]);
  const buttons = (box: FakeElement | null): FakeElement[] =>
    box
      ? box.children.flatMap((child) =>
          child.tag === 'button' ? [child] : child.children.length ? buttons(child) : [],
        )
      : [];
  return {
    win,
    messages,
    panned,
    mapHandlers,
    markers: all,
    buttons,
    byLabel: (label: string) => all().find((marker) => marker.tooltip.includes(label)),
  };
}

describe('map «все видят всех»: what a pin carries', () => {
  it('a pin with a machine on the line gets the ring, an offline one is dimmed, an old server — neither', () => {
    const [on, off, old] = toPagePins([
      pin({ id: 'a', equipmentCount: 9 }),
      pin({ id: 'b', equipmentCount: 5, onLine: false }),
      pin({ id: 'c', equipmentCount: 1, onLine: undefined }),
    ]);
    expect([on!.on, off!.on, old!.on]).toEqual([true, false, null]);
    expect(
      pinLabel({ name: 'Стройтех', equipmentCount: 4, isHouse: false, onLine: true }).sub,
    ).toBe('на линии · 4 машины');
    expect(pinLabel({ name: 'x', equipmentCount: 12, isHouse: true, onLine: true }).sub).toBe(
      'на линии · свой парк · 12 машин',
    );
    const html = providersMapHtml([pin({})], COLORS);
    expect(html).toContain('.pin.on{box-shadow:0 0 0 3px #1b8a3a');
    expect(html).toContain('.pin.off{opacity:.6');
  });

  it('the card data: city, machinery with «ещё N», price, phone — and nothing about dates', () => {
    const [data] = toPagePins([pin({})]);
    expect(data).toMatchObject({
      city: 'Набережные Челны',
      types: 'Экскаваторы, Самосвалы, Автокраны, ещё 2',
      price: 'от 24\u00a0000\u00a0₽/смена',
      phone: '+7 927 242-80-88',
      phoneHref: 'tel:+79272428088',
      orderUrl: '/orders?provider=c1',
    });
    expect(Object.keys(data!).join(' ')).not.toMatch(/created|registered|since|seen|date/i);
    expect(pinMachinesText({ machines: ['Катки'], machinesMore: 0 })).toBe('Катки');
    expect(pinMachinesText({})).toBeNull();
  });

  it('a hidden phone (null) leaves only «Написать»; a strange link is never a call', () => {
    expect(toPagePins([pin({ phone: null, phoneHref: null })])[0]).toMatchObject({
      phone: null,
      phoneHref: null,
      orderUrl: '/orders?provider=c1',
    });
    expect(toPagePins([pin({ phoneHref: 'javascript:alert(1)' })])[0]).toMatchObject({
      phone: null,
      phoneHref: null,
    });
    expect(safeTel('tel:+79272428088')).toBe('tel:+79272428088');
    expect(safeTel('tel:+7927;ext')).toBeNull();
    expect(safeTel(null)).toBeNull();
    expect(safeSitePath('/orders/o1')).toBe('/orders/o1');
    expect(safeSitePath('//evil.example/orders')).toBeNull();
    expect(safeSitePath('https://evil.example')).toBeNull();
    expect(safeSitePath(undefined)).toBeNull();
  });

  it('customers reach the page as a label and a link only', () => {
    expect(toPageCustomers([customer()])).toEqual([
      {
        id: 'o1',
        lat: 55.76,
        lon: 52.43,
        title: 'Заказчик рядом',
        sub: 'нужно: Экскаваторы · Анна П.',
        orderUrl: '/orders/o1',
      },
    ]);
    expect(toPageCustomers([customer({ lat: Number.NaN })])).toEqual([]);
  });

  it('the provider’s switches read as on until switched off', () => {
    expect([mapSwitchOn(null), mapSwitchOn(undefined), mapSwitchOn(true)]).toEqual([
      true,
      true,
      true,
    ]);
    expect(mapSwitchOn(false)).toBe(false);
  });
});

describe('map viewport', () => {
  it('words the box for ?bbox= and refuses a broken one', () => {
    expect(bboxParam({ south: 55.1234567, west: 51.9, north: 56.2, east: 53.00049 })).toBe(
      '55.123,51.900,56.200,53.000',
    );
    // The world zoomed out: clamped to the globe.
    expect(bboxParam({ south: -95, west: -200, north: 95, east: 200 })).toBe(
      '-90.000,-180.000,90.000,180.000',
    );
    expect(bboxParam({ south: 56, west: 51, north: 55, east: 53 })).toBeNull();
    expect(bboxParam({ south: 55, west: 51, north: Number.NaN, east: 53 })).toBeNull();
    expect(bboxParam({ south: 55 })).toBeNull();
    expect(bboxParam(null)).toBeNull();
  });

  it('keeps the pins outside the asked window and replaces the ones inside', () => {
    const box = { south: 55, west: 52, north: 56, east: 53 };
    const previous = [
      { id: 'stays-out', lat: 59.9, lon: 30.3 },
      { id: 'left-the-map', lat: 55.5, lon: 52.5 },
      { id: 'moved', lat: 55.6, lon: 52.6 },
    ];
    const fresh = [
      { id: 'moved', lat: 55.61, lon: 52.61 },
      { id: 'new', lat: 55.7, lon: 52.4 },
    ];
    expect(mergeInBox(previous, fresh, box)).toEqual([
      { id: 'moved', lat: 55.61, lon: 52.61 },
      { id: 'new', lat: 55.7, lon: 52.4 },
      { id: 'stays-out', lat: 59.9, lon: 30.3 },
    ]);
    expect(mergeInBox(previous, fresh, box, 2)).toHaveLength(2);
    expect(mergeInBox(previous, [], box).map((item) => item.id)).toEqual(['stays-out']);
  });
});

describe('the map page itself', () => {
  it('draws providers and customers; the card calls or writes, the customer opens the order', () => {
    const page = runPage(
      providersMapHtml(
        [
          pin({ id: 'open' }),
          pin({
            id: 'hidden',
            name: 'Тихий',
            phone: null,
            phoneHref: null,
            onLine: false,
            orderUrl: '/orders?provider=hidden',
          }),
        ],
        COLORS,
        [],
        [customer()],
      ),
    );
    const open = page.byLabel('Стройтех')!;
    const hidden = page.byLabel('Тихий')!;
    const order = page.byLabel('Заказчик рядом')!;
    expect(open.icon.html).toContain('class="pin on"');
    expect(hidden.icon.html).toContain('class="pin off"');
    expect(order.icon.html).toContain('pin cust');

    expect(open.popup!.innerHTML).toContain('Набережные Челны');
    expect(open.popup!.innerHTML).toContain('Экскаваторы, Самосвалы, Автокраны, ещё 2');
    expect(open.popup!.innerHTML).toContain('₽/смена');
    expect(page.buttons(open.popup).map((button) => button.innerHTML)).toEqual([
      'Позвонить +7 927 242-80-88',
      'Техника исполнителя',
    ]);
    page.buttons(open.popup)[0]!.onclick!();
    expect(page.messages.at(-1)).toEqual({ type: 'call', href: 'tel:+79272428088' });

    expect(page.buttons(hidden.popup).map((button) => button.innerHTML)).toEqual([
      'Написать',
      'Техника исполнителя',
    ]);
    expect(hidden.popup!.innerHTML).not.toContain('+7');
    page.buttons(hidden.popup)[0]!.onclick!();
    expect(page.messages.at(-1)).toEqual({ type: 'write', orderUrl: '/orders?provider=hidden' });

    expect(order.popup!.innerHTML).toContain('примерно');
    page.buttons(order.popup)[0]!.onclick!();
    expect(page.messages.at(-1)).toEqual({ type: 'order', id: 'o1', orderUrl: '/orders/o1' });
  });

  it('a tap centres the map and asks for the nearest; the answer becomes rows in the card', () => {
    const page = runPage(
      providersMapHtml(
        [pin({ id: 'a' }), pin({ id: 'b', name: 'Сосед' })],
        COLORS,
        [],
        [customer()],
      ),
    );
    const tapped = page.byLabel('Стройтех')!;
    tapped.fire('popupopen');
    expect(page.panned).toEqual([{ lat: 55.7, lng: 52.4 }]);
    expect(page.messages.at(-1)).toEqual({ type: 'select', key: 'provider:a' });

    const showNearby = page.win.showNearby as (key: string, items: unknown[]) => void;
    showNearby('provider:a', [
      { key: 'provider:b', title: 'Сосед <b>', sub: 'Самосвалы', distance: '1,2 км' },
      { key: 'customer:o1', title: 'Заказчик рядом', sub: 'нужно: Экскаваторы', distance: '3 км' },
    ]);
    const near = tapped.popup!.children.find((child) => child.className === 'near')!;
    const rows = near.children.filter((child) => child.tag === 'button');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.innerHTML).toContain('Сосед &lt;b>');
    expect(rows[0]!.innerHTML).toContain('1,2 км');
    // A row opens that pin's own card, which centres and asks again.
    rows[1]!.onclick!();
    expect(page.messages.at(-1)).toEqual({ type: 'select', key: 'customer:o1' });
    // An empty answer clears the list; an unknown key is ignored.
    showNearby('provider:a', []);
    expect(near.children).toHaveLength(0);
    expect(() => showNearby('provider:gone', [])).not.toThrow();
  });

  it('new pins of a viewport replace the old ones, but wait while a card is open', async () => {
    const page = runPage(providersMapHtml([pin({ id: 'a' })], COLORS));
    const setPins = page.win.setPins as (pins: unknown[], customers: unknown[]) => void;
    const next = [toPagePins([pin({ id: 'z', name: 'Новый' })]), toPageCustomers([customer()])];

    page.mapHandlers.popupopen!.forEach((handler) => handler());
    setPins(next[0]!, next[1]!);
    expect(page.byLabel('Новый')).toBeUndefined();
    expect(page.byLabel('Стройтех')).toBeDefined();

    page.mapHandlers.popupclose!.forEach((handler) => handler());
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(page.byLabel('Новый')).toBeDefined();
    expect(page.byLabel('Заказчик рядом')).toBeDefined();
    expect(page.byLabel('Стройтех')).toBeUndefined();
  });

  it('reports its viewport after a move, once, after the pause', async () => {
    const html = providersMapHtml([], COLORS);
    expect(html).toContain('var BBOX_DEBOUNCE_MS = 400;');
    const page = runPage(html.replace('var BBOX_DEBOUNCE_MS = 400;', 'var BBOX_DEBOUNCE_MS = 5;'));
    // Two moves in a row (a drag, then the inertia): one question to the server.
    page.mapHandlers.moveend!.forEach((handler) => handler());
    page.mapHandlers.moveend!.forEach((handler) => handler());
    expect(page.messages).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(page.messages).toEqual([
      { type: 'bbox', south: 55.1, west: 51.9, north: 56.2, east: 53 },
    ]);
  });

  it('house machines on the line without GPS: one marker with the list; the house pin hides under it', () => {
    const house = pin({
      id: 'house',
      name: 'СПЕЦПЛАСТ 16',
      isHouse: true,
      lat: 55.7436,
      lon: 52.3959,
    });
    const page = runPage(providersMapHtml([house, pin({ id: 'a' })], COLORS));
    expect(page.byLabel('СпецПласт16')).toBeDefined();

    const setLive = page.win.setLive as (machines: unknown[]) => void;
    const setBase = page.win.setBase as (groups: unknown[]) => void;
    setLive([
      {
        key: 'live:a',
        equipmentId: null,
        lat: 55.7436,
        lon: 52.3959,
        short: 'СП·2',
        head: 'СпецПласт16',
        body: '2 машины на линии',
        title: '2 машины на линии · СпецПласт16',
        note: null,
        house: true,
        items: [
          { equipmentId: 'e1', name: 'JCB 3CX', price: 'от 4 000 ₽/ч' },
          { equipmentId: 'e2', name: 'Автокран', price: 'от 4 500 ₽/ч' },
        ],
      },
    ]);
    // The old «на базе» list is empty now: nothing drawn, nothing broken.
    expect(() => setBase([])).not.toThrow();

    const group = page.byLabel('2 машины на линии')!;
    expect(group.icon.html).toContain('СП·2');
    expect(page.markers().filter((marker) => marker.tooltip.includes('свой парк'))).toHaveLength(0);
    expect(group.popup!.innerHTML).toContain('2 машины на линии · СпецПласт16');
    const buttons = page.buttons(group.popup);
    expect(buttons.map((button) => button.innerHTML)).toEqual([
      '<span>JCB 3CX</span><small>от 4 000 ₽/ч</small>',
      '<span>Автокран</span><small>от 4 500 ₽/ч</small>',
      'Позвонить +7 927 242-80-88',
      'Вся техника СпецПласт16',
    ]);
    buttons[1]!.onclick!();
    expect(page.messages.at(-1)).toEqual({ type: 'machine', equipmentId: 'e2' });

    // The fleet left the line: the company's own pin is back.
    setLive([]);
    expect(page.markers().filter((marker) => marker.tooltip.includes('свой парк'))).toHaveLength(1);
  });

  it('«на базе» from an older server still draws and hides the house pin', () => {
    const house = pin({ id: 'house', isHouse: true, lat: 55.7436, lon: 52.3959 });
    const page = runPage(providersMapHtml([house], COLORS));
    const setBase = page.win.setBase as (groups: unknown[]) => void;
    setBase([
      {
        lat: 55.7436,
        lon: 52.3959,
        head: 'СпецПласт16 · на базе',
        body: '2 машины · от 2 500 ₽/ч',
        items: [
          { equipmentId: 'e1', name: 'JCB', price: 'от 2 500 ₽/ч' },
          { equipmentId: 'e2', name: 'Каток', price: 'от 1 800 ₽/ч' },
        ],
      },
    ]);
    expect(page.byLabel('на базе')).toBeDefined();
    expect(page.markers().filter((marker) => marker.tooltip.includes('свой парк'))).toHaveLength(0);
    setBase([]);
    expect(page.byLabel('на базе')).toBeUndefined();
    expect(page.markers().filter((marker) => marker.tooltip.includes('свой парк'))).toHaveLength(1);
  });
});
