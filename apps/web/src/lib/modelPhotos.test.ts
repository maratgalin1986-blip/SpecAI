import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHOTO_CREDITS } from './photoCredits';
import { modelPhotosOf } from './modelPhotos';

const FLEET = [
  'Бульдозер',
  'Самосвал',
  'Виброкаток',
  'Автовышка АГП',
  'Манипулятор КМУ 7 т',
  'Колёсный экскаватор с гидромолотом',
  'Гусеничный экскаватор',
  'Автокран КС-55716',
  'Автокран 32 т',
  'Трактор МТЗ «Беларус» 82.1',
  'Экскаватор-погрузчик CASE 570',
  'Экскаватор-погрузчик LGCE B877F',
  'Экскаватор-погрузчик Hidromek HMK 102B',
  'Экскаватор-погрузчик JCB 4CX',
];

describe('model photos', () => {
  it('finds the right model for every machine of the fleet', () => {
    expect(modelPhotosOf('Автокран 32 т')[0]).toContain('crane-32t');
    expect(modelPhotosOf('Автокран КС-55716')[0]).toContain('ks-55716');
    expect(modelPhotosOf('Экскаватор-погрузчик JCB 4CX')[0]).toContain('jcb-4cx');
    expect(modelPhotosOf('Фронтальный погрузчик Lonking LG833G')).toEqual([]);
    for (const name of FLEET) expect(modelPhotosOf(name).length, name).toBeGreaterThan(0);
  });

  it('has every file on disk and credited', () => {
    const publicDir = join(__dirname, '../../public');
    const credited = new Set(PHOTO_CREDITS.map((c) => c.file));
    for (const name of FLEET) {
      for (const file of modelPhotosOf(name)) {
        expect(existsSync(join(publicDir, file)), file).toBe(true);
        expect(credited.has(file), file).toBe(true);
      }
    }
  });
});
