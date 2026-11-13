import { describe, expect, it } from 'vitest';
import { claimPhoneVideo, phonePosterOnly, releasePhoneVideo } from './phoneVideo';

describe('phonePosterOnly', () => {
  it('keeps form, machine and job pages to the poster frame', () => {
    for (const path of [
      '/contacts',
      '/orders',
      '/orders/abc',
      '/arenda',
      '/arenda/ekskavator-pogruzchik',
      '/arenda/avtokran/elabuga',
      '/raboty',
      '/raboty/kopka-transhei',
    ]) {
      expect(phonePosterOnly(path), path).toBe(true);
    }
  });

  it('leaves the show elsewhere', () => {
    for (const path of ['/', '/equipment', '/agents', '/contacts-old', '/ordersx', '/map']) {
      expect(phonePosterOnly(path), path).toBe(false);
    }
  });
});

describe('claimPhoneVideo', () => {
  it('gives the page one clip until its player lets it go', () => {
    const hero = {};
    const band = {};
    expect(claimPhoneVideo(hero)).toBe(true);
    expect(claimPhoneVideo(hero)).toBe(true);
    expect(claimPhoneVideo(band)).toBe(false);
    // Only the owner can give it back.
    releasePhoneVideo(band);
    expect(claimPhoneVideo(band)).toBe(false);
    releasePhoneVideo(hero);
    expect(claimPhoneVideo(band)).toBe(true);
    releasePhoneVideo(band);
  });
});
