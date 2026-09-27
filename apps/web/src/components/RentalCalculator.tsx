'use client';

import { useMemo, useState } from 'react';
import { CallbackForm } from '@/components/CallbackForm';

function rub(value: number) {
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

// "Hours × days × rate" estimate with an optional hydraulic hammer, and a
// callback form pre-filled with the calculation.
export function RentalCalculator({
  equipmentId,
  equipmentName,
  hourlyRate,
  hammerRate,
}: {
  equipmentId: string;
  equipmentName: string;
  hourlyRate: number;
  hammerRate?: number;
}) {
  const [hours, setHours] = useState(8);
  const [days, setDays] = useState(1);
  const [hammer, setHammer] = useState(false);
  const rate = hammer && hammerRate ? hammerRate : hourlyRate;
  const total = rate * hours * days;
  const summary = useMemo(
    () =>
      `Интересует: ${equipmentName}${hammer ? ' с гидромолотом' : ''}, ${hours} ч × ${days} дн. ` +
      `Расчёт на сайте: ${rub(total)} (без подачи).`,
    [equipmentName, hammer, hours, days, total],
  );

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">Калькулятор стоимости</h3>
      <label className="flex flex-col gap-1 text-sm">
        Часов в день: <b>{hours}</b>
        <input
          type="range"
          min={2}
          max={12}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="accent-amber-600"
        />
      </label>
      <label className="flex items-center justify-between gap-2 text-sm">
        Дней
        <input
          type="number"
          min={1}
          max={60}
          value={days}
          onChange={(e) => setDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right"
        />
      </label>
      {hammerRate && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hammer} onChange={(e) => setHammer(e.target.checked)} />С
          гидромолотом ({rub(hammerRate)}/ч)
        </label>
      )}
      <div className="rounded-lg bg-amber-50 p-3">
        <div className="text-xs text-slate-600">
          {rub(rate)}/ч × {hours} ч × {days} дн.
        </div>
        <div className="text-2xl font-bold text-slate-900">{rub(total)}</div>
        <div className="text-xs text-slate-500">
          Предварительно, без подачи техники. Точную цену подтвердит менеджер.
        </div>
      </div>
      <CallbackForm
        key={summary}
        source={`calculator:${equipmentId}`}
        defaultMessage={summary}
        title="Заказать по расчёту"
        subtitle="Оставьте телефон — подтвердим время подачи и итоговую цену."
      />
    </div>
  );
}
