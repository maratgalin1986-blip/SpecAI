import { describe, expect, it } from 'vitest';
import { toNear } from './near';

describe('toNear', () => {
  it('rounds the phone position to about 5 km', () => {
    expect(toNear({ latitude: 55.74312, longitude: 52.39811 })).toEqual({ lat: 55.75, lon: 52.4 });
    expect(toNear({ latitude: 56.8389, longitude: 60.6057 })).toEqual({ lat: 56.85, lon: 60.6 });
  });

  it('gives nothing without a position', () => {
    expect(toNear(null)).toBeNull();
    expect(toNear({ latitude: null, longitude: 52 })).toBeNull();
    expect(toNear({ latitude: Number.NaN, longitude: 52 })).toBeNull();
    expect(toNear({ latitude: 95, longitude: 52 })).toBeNull();
  });
});
