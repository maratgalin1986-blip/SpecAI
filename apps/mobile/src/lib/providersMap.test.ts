import { describe, expect, it } from 'vitest';
import {
  HOUSE_LABEL,
  TILES_URL,
  machinesLabel,
  pinLabel,
  providersMapHtml,
  scriptJson,
  sortPins,
  type ProviderPin,
} from './providersMap';

const pin = (over: Partial<ProviderPin>): ProviderPin => ({
  id: 'c1',
  name: 'Парк',
  lat: 55.7,
  lon: 52.4,
  note: null,
  imageUrl: null,
  equipmentCount: 1,
  isHouse: false,
  catalogUrl: '/providers/park',
  ...over,
});

const COLORS = { primary: '#E0560B', dark: '#222', onDark: '#fff', text: '#111' };

describe('providers map', () => {
  it('puts СпецПласт16 first, then bigger fleets', () => {
    const sorted = sortPins([
      pin({ id: 'a', equipmentCount: 2 }),
      pin({ id: 'b', equipmentCount: 9 }),
      pin({ id: 'house', isHouse: true, equipmentCount: 1 }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['house', 'b', 'a']);
  });

  it('declines the machine count', () => {
    expect(machinesLabel(1)).toBe('1 машина');
    expect(machinesLabel(3)).toBe('3 машины');
    expect(machinesLabel(11)).toBe('11 машин');
    expect(machinesLabel(25)).toBe('25 машин');
  });

  it('cannot break out of the script tag', () => {
    expect(scriptJson({ name: '</script><b>' })).not.toContain('</script>');
    const html = providersMapHtml([pin({ name: '</script><img src=x>' })], COLORS);
    expect(html.match(/<\/script>/g)).toHaveLength(2);
  });

  it('loads tiles through the site proxy, not from OSM directly', () => {
    const html = providersMapHtml([pin({})], COLORS);
    expect(TILES_URL).toMatch(/^https:\/\/.+\/api\/tiles\/\{z\}\/\{x\}\/\{y\}$/);
    expect(html).toContain('/api/tiles/{z}/{x}/{y}');
    expect(html).not.toContain('tile.openstreetmap.org');
  });

  it('opens on Russia, not on one city, until there are points or a position', () => {
    const html = providersMapHtml([], COLORS);
    expect(html).toContain('.setView([57, 55], 3)');
    expect(html).toContain('minZoom: 3');
    expect(html).not.toContain('55.7436');
    // One company: the map opens on it; several: on their bounds.
    expect(html).toContain('else if (bounds.length === 1) map.setView(bounds[0], 10);');
    expect(html).toContain('map.fitBounds(bounds');
    // The customer's own position moves the map to them (window.setMe).
    expect(html).toContain('if (center) map.setView([point.lat, point.lon]');
  });

  it('builds a page with every pin', () => {
    const html = providersMapHtml(
      [pin({ id: 'x1', note: 'Подача бесплатно' }), pin({ id: 'house', isHouse: true })],
      COLORS,
    );
    expect(html).toContain('"id":"house"');
    expect(html).toContain('Подача бесплатно');
    expect(html.indexOf('"id":"house"')).toBeLessThan(html.indexOf('"id":"x1"'));
  });

  it('labels every company above its pin, the house fleet as СпецПласт16', () => {
    expect(pinLabel({ name: 'specplast', equipmentCount: 12, isHouse: true })).toEqual({
      title: HOUSE_LABEL,
      sub: 'свой парк · 12 машин',
    });
    expect(pinLabel({ name: 'Стройтех', equipmentCount: 3, isHouse: false })).toEqual({
      title: 'Стройтех',
      sub: '3 машины',
    });
    expect(
      pinLabel({ name: 'Я'.repeat(50), equipmentCount: 1, isHouse: false }).title,
    ).toHaveLength(28);
    const html = providersMapHtml([pin({ isHouse: true, id: 'house' })], COLORS);
    expect(html).toContain('"title":"СпецПласт16"');
    expect(html).toContain("permanent: true, direction: 'top'");
    expect(html).toContain('var LABELS_MIN_ZOOM = 8;');
    // The label ranks are read with a real digit class in the page.
    expect(html).toContain('/ r(\\d)/.exec');
  });

  it('draws the platform «приём заявок» points with the city only', () => {
    const html = providersMapHtml([], COLORS, [
      {
        city: 'Казань',
        lat: 55.79,
        lon: 49.1,
        title: 'ИИСтройка24 · приём заявок',
        text: 'Казань: оставьте заявку — найдём технику',
      },
    ]);
    expect(html).toContain('"city":"Казань"');
    expect(html).toContain('ИИСтройка24 · приём заявок');
    expect(html).toContain("type: 'intake', city: p.city");
    expect(html).toContain('var INTAKE_CLEAR_KM = 30;');
  });
});
