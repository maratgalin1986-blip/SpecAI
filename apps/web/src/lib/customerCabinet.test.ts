import { describe, expect, it } from 'vitest';
import { chosenProviders, repeatOrderHref, repeatWithProviderHref } from './customerCabinet';

describe('кабинет заказчика', () => {
  it('«Заказать снова» сохраняет вид техники и адрес', () => {
    expect(repeatOrderHref({ categoryId: 'cat1', address: ' Казань, ул. Баумана 1 ' })).toBe(
      '/orders?category=cat1&address=%D0%9A%D0%B0%D0%B7%D0%B0%D0%BD%D1%8C%2C+%D1%83%D0%BB.+%D0%91%D0%B0%D1%83%D0%BC%D0%B0%D0%BD%D0%B0+1#new',
    );
    expect(repeatOrderHref({})).toBe('/orders#new');
  });

  it('«Мои исполнители» — только после подтверждения, свежие первыми', () => {
    const at = (d: string) => new Date(`2026-10-${d}T10:00:00Z`);
    const list = chosenProviders([
      { status: 'PENDING', createdAt: at('27'), equipment: { companyId: 'a', categoryId: 'x' } },
      { status: 'COMPLETED', createdAt: at('01'), equipment: { companyId: 'b', categoryId: 'x' } },
      { status: 'CONFIRMED', createdAt: at('20'), equipment: { companyId: 'c', categoryId: 'y' } },
      { status: 'COMPLETED', createdAt: at('25'), equipment: { companyId: 'b', categoryId: 'z' } },
      { status: 'CANCELLED', createdAt: at('26'), equipment: { companyId: 'd', categoryId: 'x' } },
    ]);
    expect(list.map((item) => item.companyId)).toEqual(['b', 'c']);
    expect(list[0]).toMatchObject({ bookings: 2, categoryId: 'z' });
    expect(repeatWithProviderHref(list[0]!)).toBe('/orders?provider=b&category=z#new');
  });
});
