// Кабинет заказчика (owner, 2026-10-28): «Заказать снова» и «Мои исполнители».
// Чистые функции — страница /dashboard и тесты.

/** Ссылка «Заказать снова»: тот же вид техники и адрес, даты — новые. */
export function repeatOrderHref(order: {
  categoryId?: string | null;
  address?: string | null;
}): string {
  const params = new URLSearchParams();
  if (order.categoryId) params.set('category', order.categoryId);
  const address = order.address?.trim().slice(0, 200);
  if (address) params.set('address', address);
  const query = params.toString();
  return `/orders${query ? `?${query}` : ''}#new`;
}

/** Брони, после которых исполнитель «мой»: он подтвердил или выполнил заказ. */
const CHOSEN_STATUSES = new Set(['CONFIRMED', 'ACTIVE', 'COMPLETED']);

export interface ChosenProvider {
  companyId: string;
  /** Последняя машина у этого исполнителя — для «Заказать снова». */
  categoryId: string | null;
  bookings: number;
  lastAt: Date;
}

/**
 * Исполнители, с которыми заказчик уже работал, свежие первыми. Только
 * подтверждённые брони: до подтверждения заказчик исполнителя ещё не выбрал.
 */
export function chosenProviders(
  bookings: {
    status: string;
    createdAt: Date;
    equipment: { companyId: string; categoryId?: string | null };
  }[],
  limit = 10,
): ChosenProvider[] {
  const byCompany = new Map<string, ChosenProvider>();
  for (const booking of bookings) {
    if (!CHOSEN_STATUSES.has(booking.status)) continue;
    const id = booking.equipment.companyId;
    const seen = byCompany.get(id);
    if (!seen) {
      byCompany.set(id, {
        companyId: id,
        categoryId: booking.equipment.categoryId ?? null,
        bookings: 1,
        lastAt: booking.createdAt,
      });
      continue;
    }
    seen.bookings += 1;
    if (booking.createdAt > seen.lastAt) {
      seen.lastAt = booking.createdAt;
      seen.categoryId = booking.equipment.categoryId ?? seen.categoryId;
    }
  }
  return [...byCompany.values()]
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
    .slice(0, limit);
}

/** «Заказать снова» у выбранного исполнителя: заявка именно ему. */
export function repeatWithProviderHref(provider: ChosenProvider): string {
  const params = new URLSearchParams({ provider: provider.companyId });
  if (provider.categoryId) params.set('category', provider.categoryId);
  return `/orders?${params.toString()}#new`;
}

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  CONTRACT: 'Договор',
  INSURANCE_CERTIFICATE: 'Страховка',
  INSPECTION_REPORT: 'Акт осмотра',
  INVOICE: 'Счёт',
  OTHER: 'Документ',
};
