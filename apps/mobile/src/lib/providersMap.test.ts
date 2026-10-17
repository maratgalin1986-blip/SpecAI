import { describe, expect, it } from 'vitest';
import {
  TILES_URL,
  machinesLabel,
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
});
