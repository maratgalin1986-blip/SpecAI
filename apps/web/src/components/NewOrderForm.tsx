'use client';

import { useEffect, useState } from 'react';
import { CategorySelect, type SelectableCategory } from '@/components/CategorySelect';
import { ConditionsPreview } from '@/components/ConditionsPreview';
import { DemandHint } from '@/components/DemandHint';
import { GuestOrderForm } from '@/components/GuestOrderForm';
import { PointPicker } from '@/components/PointPicker';
import { visitorNear } from '@/components/visitorNear';
import { noteInstallMoment } from '@/lib/installHint';
import { pointAddress, type MapPoint } from '@/lib/mapPoint';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@specai/ui';
import type { OrderPrefill } from '@/lib/quickOrder';

/** Today's date in Moscow as YYYY-MM-DD, the earliest allowed order date. */
function todayInMoscow() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
}

type Category = SelectableCategory;

export function NewOrderForm({
  provider,
  initial,
}: {
  provider?: { name: string } | null;
  /** From the cabinet's quick-order panel (lib/quickOrder.ts). */
  initial?: OrderPrefill;
} = {}) {
  const router = useRouter();
  const { status } = useSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  // From the map's «Оставить заявку»: the order names the chosen provider.
  const [description, setDescription] = useState(
    (provider ? `Для исполнителя «${provider.name}». ` : '') + (initial?.description ?? ''),
  );
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [point, setPoint] = useState<MapPoint | null>(null);
  // The visitor's town, only if location is already allowed: «Мира 10» is
  // then found there, not in a random city.
  const [near, setNear] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void visitorNear().then((value) => {
      if (alive) setNear(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []));
  }, []);

  // No registration on the site: a visitor orders with a name and a phone
  // (GuestOrderForm → /api/orders/guest), providers bid as on any order.
  if (status === 'unauthenticated') {
    return <GuestOrderForm provider={provider} initial={initial} />;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    let response: Response;
    try {
      response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          desiredStartDate: startDate,
          desiredEndDate: endDate,
          categoryId: categoryId || undefined,
          address: address.trim() || undefined,
          near: near ?? undefined,
        }),
      });
    } catch {
      setIsSubmitting(false);
      setError('Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.');
      return;
    }

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(typeof body?.error === 'string' ? body.error : 'Не удалось создать заявку');
      return;
    }

    // The order page shows what happens next (offers, chat); the list under
    // the form only refreshes if the id is missing for some reason.
    const created = (await response.json().catch(() => null)) as { order?: { id?: string } } | null;
    setDescription('');
    setCategoryId('');
    setStartDate('');
    setEndDate('');
    setAddress('');
    setPoint(null);
    // A good moment to offer «Установить на экран» (InstallPrompt).
    noteInstallMoment();
    if (created?.order?.id) {
      router.push(`/orders/${encodeURIComponent(created.order.id)}`);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="ym-hide-content flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Что нужно
        <textarea
          required
          rows={3}
          placeholder="Например: нужен экскаватор для рытья траншеи 50 м, мягкий грунт"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Техника (необязательно)
        <CategorySelect
          categories={categories}
          value={categoryId}
          onChange={setCategoryId}
          emptyLabel="Любая"
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <DemandHint
        categoryId={categoryId}
        categoryName={categories.find((category) => category.id === categoryId)?.name}
      />

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Нужна с
          <input
            type="date"
            required
            min={todayInMoscow()}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          По
          <input
            type="date"
            required
            min={startDate || todayInMoscow()}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Адрес работ
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Набережные Челны, проспект Мира, 49"
          autoComplete="street-address"
          maxLength={200}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
        <span className="text-xs text-slate-500">
          По адресу покажем погоду на день работ и вид места сверху.
        </span>
      </label>
      <PointPicker
        value={point}
        onPick={(next) => {
          setPoint(next);
          // The street part stays as a label; the point is what gets located.
          const street = (address.split(' · Точка на карте:')[0] ?? '')
            .replace(/^Точка на карте:.*$/, '')
            .trim();
          setAddress(
            next ? (street ? `${street} · ${pointAddress(next)}` : pointAddress(next)) : street,
          );
        }}
      />

      <ConditionsPreview
        date={startDate}
        address={address}
        near={near}
        categoryName={categories.find((category) => category.id === categoryId)?.name}
      />

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Публикация…' : 'Опубликовать заявку'}
      </Button>
    </form>
  );
}
