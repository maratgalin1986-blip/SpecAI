'use client';

import { useEffect, useState } from 'react';
import { Button } from '@specai/ui';
import { ConsentText } from '@/components/ConsentText';
import { DemandHint } from '@/components/DemandHint';
import { SITE } from '@/lib/site';
import type { OrderPrefill } from '@/lib/quickOrder';

/** Today's date in Moscow as YYYY-MM-DD, the earliest allowed order date. */
function todayInMoscow() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
}

interface Category {
  id: string;
  name: string;
}

/**
 * The order form for visitors without an account (there is no registration
 * on the site): what is needed, the machine type, dates, the address, a name,
 * a phone and the consent. POST /api/orders/guest puts the order on the
 * board; providers bid, the dispatcher calls back with the best offers.
 */
export function GuestOrderForm({
  provider,
  initial,
}: {
  provider?: { name: string } | null;
  initial?: OrderPrefill;
} = {}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [description, setDescription] = useState(
    (provider ? `Для исполнителя «${provider.name}». ` : '') + (initial?.description ?? ''),
  );
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!consent) {
      setError('Нужно согласие на обработку персональных данных');
      return;
    }
    setIsSubmitting(true);
    let response: Response;
    try {
      response = await fetch('/api/orders/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          desiredStartDate: startDate,
          desiredEndDate: endDate || startDate,
          categoryId: categoryId || undefined,
          address: address.trim() || undefined,
          name,
          phone,
          consent: true,
          website,
        }),
      });
    } catch {
      setIsSubmitting(false);
      setError('Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.');
      return;
    }
    setIsSubmitting(false);
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(typeof body?.error === 'string' ? body.error : 'Не удалось отправить заявку');
      return;
    }
    setDone(
      typeof body?.message === 'string'
        ? body.message
        : 'Заявка опубликована — исполнители пришлют цены, мы перезвоним.',
    );
  }

  if (done) {
    return (
      <div
        role="status"
        className="flex flex-col gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
      >
        <p className="font-semibold">Заявка принята</p>
        <p>{done}</p>
        <p className="text-xs text-green-800">
          Что дальше: исполнители сервиса видят заявку в своём приложении и предлагают цену,
          диспетчер {SITE.name} сравнит предложения и перезвонит вам по номеру {phone}.
        </p>
      </div>
    );
  }

  const categoryName = categories.find((category) => category.id === categoryId)?.name;

  return (
    <form onSubmit={handleSubmit} className="ym-hide-content flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Что нужно
        <textarea
          required
          rows={3}
          maxLength={2000}
          placeholder="Например: нужен экскаватор для рытья траншеи 50 м, мягкий грунт"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Техника
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        >
          <option value="">Подобрать по описанию</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <DemandHint categoryId={categoryId} categoryName={categoryName} />

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
          По адресу исполнители посчитают подачу и увидят погоду на день работ.
        </span>
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Как к вам обращаться
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            maxLength={100}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Телефон
          <input
            required
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="+7 900 000-00-00"
            maxLength={30}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      {/* Honeypot: hidden from people, filled by bots. */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        <ConsentText />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Публикация…' : 'Опубликовать заявку'}
      </Button>
      <p className="text-xs text-slate-500">
        Телефон видят только исполнители, которые нажмут «Показать телефон» — каждый показ
        записывается. Публично номер не показывается.
      </p>
    </form>
  );
}
