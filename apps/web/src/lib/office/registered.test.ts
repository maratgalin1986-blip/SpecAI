import { describe, expect, it, vi } from 'vitest';

const updateMany = vi.fn();
vi.mock('@specai/database', () => ({
  prisma: { prospect: { updateMany: (...a: unknown[]) => updateMany(...a) } },
}));

import { markProspectRegistered, phoneTail10 } from './registered';

describe('markProspectRegistered', () => {
  it('помечает кандидата только когда телефон регистрирующегося совпал с карточкой', async () => {
    updateMany.mockResolvedValueOnce({ count: 1 });
    const now = new Date('2026-11-09T10:00:00Z');
    expect(await markProspectRegistered('arenda-kazan-ab12', '+7 (917) 000-11-22', now)).toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        slug: 'arenda-kazan-ab12',
        kind: 'provider',
        status: { in: ['PUBLISHED', 'AGREED', 'CONTACTED', 'READY'] },
        OR: [{ phone: { endsWith: '9170001122' } }, { whatsapp: { endsWith: '9170001122' } }],
      },
      data: { status: 'REGISTERED', registeredAt: now },
    });
  });

  it('без полного номера или с плохим slug в базу не ходит', async () => {
    updateMany.mockClear();
    expect(await markProspectRegistered('arenda-kazan-ab12', '123')).toBe(0);
    expect(await markProspectRegistered('Плохой Slug', '+79170001122')).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('phoneTail10', () => {
    expect(phoneTail10('8 (917) 000-11-22')).toBe('9170001122');
    expect(phoneTail10(null)).toBe('');
  });
});
