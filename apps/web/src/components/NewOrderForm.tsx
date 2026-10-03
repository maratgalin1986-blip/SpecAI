'use client';

import { useEffect, useState } from 'react';
import { ConditionsPreview } from '@/components/ConditionsPreview';
import { PointPicker } from '@/components/PointPicker';
import { pointAddress, type MapPoint } from '@/lib/mapPoint';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@specai/ui';

/** Today's date in Moscow as YYYY-MM-DD, the earliest allowed order date. */
function todayInMoscow() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
}

interface Category {
  id: string;
  name: string;
}

export function NewOrderForm({ provider }: { provider?: { name: string } | null } = {}) {
  const router = useRouter();
  const { status } = useSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  // From the map's «Оставить заявку»: the order names the chosen provider.
  const [description, setDescription] = useState(
    provider ? `Техника базы «${provider.name}». ` : '',
  );
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [address, setAddress] = useState('');
  const [point, setPoint] = useState<MapPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []));
  }, []);

  if (status === 'unauthenticated') {
    return (
      <p className="text-sm text-slate-600">
        <a href="/login" className="font-medium text-amber-700">
          Войдите
        </a>{' '}
        , чтобы разместить заявку.
      </p>
    );
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

    setDescription('');
    setCategoryId('');
    setStartDate('');
    setEndDate('');
    setAddress('');
    setPoint(null);
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
        Категория (необязательно)
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        >
          <option value="">Любая</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

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
