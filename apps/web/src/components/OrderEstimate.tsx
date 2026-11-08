import { orderEstimate } from '@/lib/orderEstimate';
import { pluralizeRu } from '@/lib/pluralize';
import { rub, SHIFT_HOURS } from '@/lib/prices';

// The price guide under the machinery type on the order forms: shown as soon
// as a type with a house price is chosen, updated with the dates. Providers
// answer with their own prices, so it is labelled as a guide.
export function OrderEstimate({
  categoryName,
  startDate,
  endDate,
}: {
  categoryName: string | undefined;
  startDate: string;
  endDate: string;
}) {
  const value = orderEstimate(categoryName, startDate, endDate);
  if (!value) return null;
  return (
    <div
      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-slate-800"
      aria-live="polite"
    >
      <p className="font-semibold">
        Ориентир: от {rub(value.perHour)} ₽/ч · смена {SHIFT_HOURS} ч — {rub(value.perShift)} ₽
      </p>
      {value.total !== null && value.days > 1 && (
        <p>
          За {pluralizeRu(value.days, ['день', 'дня', 'дней'])} — около {rub(value.total)} ₽
        </p>
      )}
      <p className="text-xs text-slate-500">
        По ценам парка СпецПласт16, с оператором. Исполнители предложат свои цены — выберете
        подходящую.
      </p>
    </div>
  );
}
