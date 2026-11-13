import { describe, expect, it } from 'vitest';
import { breadcrumbJsonLd, HOME_CRUMB } from './breadcrumbs';

describe('breadcrumbJsonLd', () => {
  it('numbers the trail from the home page with absolute addresses', () => {
    const ld = breadcrumbJsonLd(
      [
        HOME_CRUMB,
        { name: 'Работы и цены', path: '/raboty' },
        { name: 'Копка траншей', path: '/raboty/kopka-transhei' },
      ],
      'https://example.ru/',
    );
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://example.ru/' },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Работы и цены',
        item: 'https://example.ru/raboty',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Копка траншей',
        item: 'https://example.ru/raboty/kopka-transhei',
      },
    ]);
  });
});
