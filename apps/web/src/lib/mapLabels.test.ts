import { describe, expect, it } from 'vitest';
import { LABEL_NAME_MAX, liveLabel, providerLabel } from './mapLabels';

describe('providerLabel', () => {
  it('names the company and its machinery count', () => {
    expect(providerLabel({ name: 'Стройтех', equipmentCount: 4, isHouse: false })).toEqual({
      title: 'Стройтех',
      sub: '4 машины',
    });
  });

  it('marks the house fleet as СпецПласт16 whatever the row is called', () => {
    expect(providerLabel({ name: 'specplast', equipmentCount: 12, isHouse: true })).toEqual({
      title: 'СпецПласт16',
      sub: 'свой парк · 12 машин',
    });
  });

  it('cuts a long name', () => {
    const label = providerLabel({ name: 'А'.repeat(60), equipmentCount: 1, isHouse: false });
    expect(label.title.length).toBe(LABEL_NAME_MAX);
    expect(label.title.endsWith('…')).toBe(true);
  });
});

describe('liveLabel', () => {
  it('splits the server bubble into «Я на линии» and «машина · цена · имя»', () => {
    const bubble = 'Я на линии · Экскаватор JCB · от 4 000 ₽/ч · Марат Г.';
    expect(liveLabel({ bubble, company: { isHouse: false } })).toEqual({
      title: 'Экскаватор JCB · от 4 000 ₽/ч · Марат Г.',
      sub: 'Я на линии',
    });
    expect(liveLabel({ bubble, company: { isHouse: true } }).sub).toBe('Я на линии · СпецПласт16');
  });
});
