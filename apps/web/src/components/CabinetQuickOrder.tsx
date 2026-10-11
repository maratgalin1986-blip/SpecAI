'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { categoryIcon } from '@/components/EquipmentCard';
import { quickOrderHref, todayMsk, type QuickWhen } from '@/lib/quickOrder';

// The quick-order panel at the top of the customer cabinet: machine type
// tiles, «Нужна сейчас» / «На дату», the address and one button. It opens the
// usual order form already filled in (/orders?category=…&start=…#new), where
// the customer adds a sentence about the job and publishes it.

export interface QuickCategory {
  id: string;
  name: string;
}

export function CabinetQuickOrder({ categories }: { categories: QuickCategory[] }) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState('');
  const [when, setWhen] = useState<QuickWhen>('now');
  const [date, setDate] = useState('');
  const [address, setAddress] = useState('');
  const tiles = categories.slice(0, 8);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    router.push(quickOrderHref({ categoryId, when, date, address }));
  }

  return (
    <form onSubmit={submit} className="cab-dark flex flex-col gap-4" aria-label="Быстрый заказ">
      <div>
        <p className="cab-eyebrow text-signal-300">Быстрый заказ</p>
        <h2 className="mt-1 text-xl font-extrabold tracking-tight">Какая техника нужна?</h2>
      </div>

      <div
        className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible"
        role="radiogroup"
        aria-label="Тип техники"
      >
        {tiles.map((category) => {
          const active = categoryId === category.id;
          return (
            <button
              key={category.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setCategoryId(active ? '' : category.id)}
              className={`flex min-h-[84px] w-28 shrink-0 snap-start flex-col justify-between gap-2 rounded-2xl p-3 text-left text-xs font-semibold leading-tight transition sm:w-auto ${
                active
                  ? 'bg-signal-500 text-graphite-950'
                  : 'bg-graphite-800 text-graphite-100 hover:bg-graphite-700'
              }`}
            >
              <Icon
                name={categoryIcon(category.name)}
                className={`h-7 w-7 ${active ? 'text-graphite-950' : 'text-signal-400'}`}
              />
              {category.name}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-full bg-graphite-800 p-1" role="radiogroup">
        {(
          [
            ['now', 'Нужна сейчас'],
            ['date', 'На дату'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={when === value}
            onClick={() => setWhen(value)}
            className={`min-h-[40px] rounded-full text-sm font-bold transition ${
              when === value ? 'bg-white text-graphite-950' : 'text-graphite-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {when === 'date' && (
        <label className="flex flex-col gap-1 text-sm text-graphite-100">
          Дата работ
          <input
            type="date"
            required
            min={todayMsk()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-[44px] rounded-xl border border-graphite-600 bg-graphite-800 px-3 text-white [color-scheme:dark]"
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm text-graphite-100">
        Адрес работ
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Набережные Челны, улица, дом"
          autoComplete="street-address"
          maxLength={200}
          className="min-h-[44px] rounded-xl border border-graphite-600 bg-graphite-800 px-3 text-white placeholder:text-graphite-400"
        />
      </label>

      <button type="submit" className="cab-action w-full text-base">
        Найти исполнителей
        <Icon name="arrow" className="h-4 w-4" />
      </button>
      <p className="text-xs text-graphite-300">
        Заявку увидят все исполнители рядом — они пришлют цены, вы выберете. Бесплатно.
      </p>
    </form>
  );
}
