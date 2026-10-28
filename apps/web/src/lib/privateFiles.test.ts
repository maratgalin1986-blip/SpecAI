import { describe, expect, it } from 'vitest';
import {
  canReadPrivateFile,
  isPrivateKey,
  privateFileUrl,
  privateKeyCompany,
  privateKeyFromUrl,
  privateVerificationKey,
} from './privateFiles';

describe('закрытые файлы проверки', () => {
  const key = privateVerificationKey('comp1', 'СТС фото.jpg', 'rnd');

  it('ключ в папке компании, без опасных символов', () => {
    expect(key).toBe('private/verification/comp1/rnd-_.jpg');
    expect(isPrivateKey(key)).toBe(true);
    expect(privateKeyCompany(key)).toBe('comp1');
    expect(privateKeyCompany('private/verification/comp1/../x')).toBe(null);
    expect(privateKeyCompany('equipment/comp1/a.jpg')).toBeNull();
    expect(privateKeyFromUrl(privateFileUrl(key))).toBe(key);
  });

  it('открывают только админ своей компании и админ площадки', () => {
    expect(canReadPrivateFile(key, { role: 'PROVIDER_ADMIN', companyId: 'comp1' }, false)).toBe(
      true,
    );
    expect(canReadPrivateFile(key, { role: 'PROVIDER_ADMIN', companyId: 'comp2' }, false)).toBe(
      false,
    );
    expect(canReadPrivateFile(key, { role: 'PROVIDER_OPERATOR', companyId: 'comp1' }, false)).toBe(
      false,
    );
    expect(canReadPrivateFile(key, { role: 'CUSTOMER', companyId: null }, false)).toBe(false);
    expect(canReadPrivateFile(key, null, false)).toBe(false);
    expect(canReadPrivateFile(key, null, true)).toBe(true);
    expect(canReadPrivateFile(key, { role: 'PLATFORM_ADMIN' }, false)).toBe(true);
    expect(canReadPrivateFile('equipment/comp1/a.jpg', null, true)).toBe(false);
  });
});
