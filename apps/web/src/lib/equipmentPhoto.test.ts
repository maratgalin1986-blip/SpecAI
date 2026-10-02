import { describe, expect, it } from 'vitest';
import { listingPhoto } from './equipmentPhoto';

const origin = 'https://spec-ai-web.vercel.app';

describe('listingPhoto', () => {
  it('keeps only safe photos and makes site paths absolute', () => {
    expect(
      listingPhoto(
        {
          name: 'JCB 3CX',
          imageUrls: ['javascript:alert(1)', '/images/a.jpg', 'https://cdn.ru/b.jpg', 'http://x'],
        },
        origin,
      ),
    ).toEqual({
      imageUrls: [`${origin}/images/a.jpg`, 'https://cdn.ru/b.jpg'],
      photoUrl: `${origin}/images/a.jpg`,
      photoIsExample: false,
    });
  });

  it('falls back to an example photo of the machine type', () => {
    const photo = listingPhoto(
      { name: 'Автокран 25 т', imageUrls: [], category: { name: 'Автокраны' } },
      origin,
    );
    expect(photo.photoIsExample).toBe(true);
    expect(photo.photoUrl).toMatch(/^https:\/\/spec-ai-web\.vercel\.app\/images\//);
    expect(listingPhoto({ name: 'Что-то', imageUrls: [] }, origin).photoUrl).toBeNull();
  });
});
