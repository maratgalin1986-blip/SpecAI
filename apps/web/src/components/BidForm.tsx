'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@specai/ui';
import { formatMoney } from '@/lib/money';
import { isProvider } from '@/lib/fleet';
import { bidTotal } from '@/lib/offerBreakdown';

interface EquipmentOption {
  id: string;
  name: string;
  dailyRate: string;
}

/** The company's pending bid on this order: one bid per company, a repeat updates it. */
export interface ExistingBid {
  price: number;
  currency: string;
  message: string | null;
  equipmentId: string;
  deliveryPrice?: number | null;
  shiftPrice?: number | null;
  shifts?: number | null;
  optionsNote?: string | null;
}

const toNumber = (value: string) => {
  const n = Number(value.replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * «Предложить цену» with the breakdown: подача + цена смены × смен = итого
 * (the server checks the sum). The delivery is prefilled from the distance
 * to the site and the company's price per km; the shifts from the order's
 * days. Without a shift price the total is typed by hand, as before.
 */
export function BidForm({
  orderId,
  existing,
  suggestedDelivery,
  days,
}: {
  orderId: string;
  existing?: ExistingBid;
  /** Distance × the company's price per km, when both are known. */
  suggestedDelivery?: number | null;
  /** Days of the order (the default number of shifts). */
  days?: number;
}) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentOption[]>([]);
  const [equipmentId, setEquipmentId] = useState(existing?.equipmentId ?? '');
  const [delivery, setDelivery] = useState(
    existing?.deliveryPrice != null
      ? String(existing.deliveryPrice)
      : suggestedDelivery != null
        ? String(Math.round(suggestedDelivery))
        : '',
  );
  const [shiftPrice, setShiftPrice] = useState(
    existing?.shiftPrice != null ? String(existing.shiftPrice) : '',
  );
  const [shifts, setShifts] = useState(String(existing?.shifts ?? days ?? 1));
  const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const [optionsNote, setOptionsNote] = useState(existing?.optionsNote ?? '');
  const [message, setMessage] = useState(existing?.message ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user.companyId) return;
    fetch(`/api/equipment?companyId=${session.user.companyId}&status=AVAILABLE`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(typeof data?.error === 'string' ? data.error : 'Не удалось загрузить технику');
          return;
        }
        setEquipmentOptions(data?.equipment ?? []);
      })
      .catch(() => setError('Не удалось загрузить технику, проверьте связь'));
  }, [session?.user.companyId]);

  // The total follows the breakdown while a shift price is given.
  const shiftValue = toNumber(shiftPrice);
  const shiftsValue = Math.max(1, Math.round(toNumber(shifts) || 1));
  const deliveryValue = delivery.trim() ? toNumber(delivery) : 0;
  const hasBreakdown = shiftPrice.trim() !== '' && shiftValue > 0;
  const total = hasBreakdown ? bidTotal(deliveryValue || 0, shiftValue, shiftsValue) : null;
  useEffect(() => {
    if (total !== null) setPrice(String(total));
  }, [total]);

  if (status !== 'authenticated' || !isProvider(session.user)) {
    return null;
  }

  function useCardRate() {
    const option = equipmentOptions.find((item) => item.id === equipmentId);
    if (option) setShiftPrice(String(Math.round(Number(option.dailyRate))));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch(`/api/orders/${orderId}/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        equipmentId,
        price: Number(price),
        message: message || undefined,
        ...(hasBreakdown
          ? {
              deliveryPrice: deliveryValue || 0,
              shiftPrice: shiftValue,
              shifts: shiftsValue,
            }
          : delivery.trim()
            ? { deliveryPrice: deliveryValue || 0 }
            : {}),
        optionsNote: optionsNote.trim() || undefined,
      }),
    });

    setIsSubmitting(false);

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(typeof body?.error === 'string' ? body.error : 'Не удалось отправить предложение');
      return;
    }

    setSubmitted(
      typeof body?.message === 'string'
        ? body.message
        : response.status === 200
          ? 'Предложение обновлено'
          : 'Предложение отправлено',
    );
    router.refresh();
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm">
        <p className="text-green-700">{submitted}.</p>
        <button
          type="button"
          onClick={() => setSubmitted(null)}
          className="font-medium text-amber-700 hover:underline"
        >
          Изменить предложение
        </button>
      </div>
    );
  }

  if (equipmentOptions.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Нет доступной техники для предложения. Добавьте технику в{' '}
        <a href="/provider" className="font-medium text-amber-700">
          кабинете парка
        </a>
        .
      </p>
    );
  }

  const field = 'rounded-md border border-slate-300 px-3 py-2';

  return (
    <form onSubmit={handleSubmit} className="ym-hide-content flex flex-col gap-3">
      {existing && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Вы уже предложили {formatMoney(existing.price, existing.currency)} — можно изменить цену,
          машину или сообщение.
        </p>
      )}
      <label className="flex flex-col gap-1 text-sm">
        Ваша техника
        <select
          required
          value={equipmentId}
          onChange={(e) => setEquipmentId(e.target.value)}
          className={field}
        >
          <option value="" disabled>
            Выберите технику
          </option>
          {equipmentOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({formatMoney(item.dailyRate)}/смена)
            </option>
          ))}
        </select>
      </label>

      <fieldset className="grid grid-cols-3 gap-2">
        <legend className="mb-1 text-sm">Из чего складывается цена</legend>
        <label className="flex flex-col gap-1 text-xs">
          Подача, ₽
          <input
            type="number"
            min={0}
            step="1"
            inputMode="numeric"
            value={delivery}
            onChange={(e) => setDelivery(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Смена, ₽
          <input
            type="number"
            min={0}
            step="1"
            inputMode="numeric"
            value={shiftPrice}
            onChange={(e) => setShiftPrice(e.target.value)}
            placeholder="по прайсу"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Смен
          <input
            type="number"
            min={1}
            max={366}
            step="1"
            inputMode="numeric"
            value={shifts}
            onChange={(e) => setShifts(e.target.value)}
            className={field}
          />
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
        {suggestedDelivery != null && (
          <span>Подача по вашей цене за км: {formatMoney(Math.round(suggestedDelivery))}</span>
        )}
        {equipmentId && !shiftPrice && (
          <button type="button" onClick={useCardRate} className="font-medium text-amber-700">
            Смена по прайсу
          </button>
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Итого за весь период, ₽
        <input
          type="number"
          required
          min={1}
          step="0.01"
          value={price}
          readOnly={hasBreakdown}
          onChange={(e) => setPrice(e.target.value)}
          className={`${field} ${hasBreakdown ? 'bg-slate-50 font-semibold' : ''}`}
        />
        {hasBreakdown && (
          <span className="text-xs text-slate-500">
            {formatMoney(deliveryValue || 0)} подача + {formatMoney(shiftValue)} × {shiftsValue} ={' '}
            {formatMoney(total ?? 0)}
          </span>
        )}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Опции (необязательно)
        <input
          value={optionsNote}
          onChange={(e) => setOptionsNote(e.target.value)}
          maxLength={300}
          placeholder="Гидромолот, второй машинист, работа ночью…"
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Сообщение (необязательно)
        <textarea
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={field}
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Отправка…' : existing ? 'Обновить предложение' : 'Предложить'}
      </Button>
    </form>
  );
}
