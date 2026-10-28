'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@specai/ui';
import { AutoCategoryNote, useAutoCategory } from '@/components/AutoCategory';
import { CategorySelect, type SelectableCategory } from '@/components/CategorySelect';
import { ConsentText } from '@/components/ConsentText';
import { DemandHint } from '@/components/DemandHint';
import { OrderEstimate } from '@/components/OrderEstimate';
import { PointPicker } from '@/components/PointPicker';
import { noteInstallMoment } from '@/lib/installHint';
import { addressWithPoint, type MapPoint } from '@/lib/mapPoint';
import { onOrderPrefill, withPrefillLine } from '@/lib/orderPrefillEvent';
import { SITE } from '@/lib/site';
import { PromiseNote } from '@/components/PromiseNote';
import type { OrderPrefill } from '@/lib/quickOrder';

/** Today's date in Moscow as YYYY-MM-DD, the earliest allowed order date. */
function todayInMoscow() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
}

type Category = SelectableCategory;

/**
 * The order form for visitors without an account (/orders): what is needed, the machine type, dates, the address, a name,
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
  const [point, setPoint] = useState<MapPoint | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const categoryInputId = useId();
  const autoCategory = useAutoCategory({
    description,
    categories,
    categoryId,
    setCategoryId,
    pickedByHand: Boolean(initial?.categoryId),
  });

  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]));
  }, []);

  // «Заказать» on a machine above the form (OfferNow): its type and a line.
  const { pick } = autoCategory;
  useEffect(
    () =>
      onOrderPrefill(({ categorySlug, text }) => {
        const row = categorySlug ? categories.find((c) => c.slug === categorySlug) : undefined;
        if (row) pick(row.id);
        setDescription((current) => withPrefillLine(current, text));
      }),
    // pick only sets state; the list is what changes the lookup.
    [categories],
  );

  // The form sits far down /orders on a phone: when it turns into the short
  // confirmation the page gets shorter and the browser is left on the footer.
  // Bring the message into view and read it out.
  useEffect(() => {
    if (!done) return;
    const el = doneRef.current;
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.focus({ preventScroll: true });
  }, [done]);

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
    // A good moment to offer «Установить на экран» (InstallPrompt).
    noteInstallMoment();
    setDone(
      typeof body?.message === 'string'
        ? body.message
        : 'Заявка опубликована — исполнители пришлют цены, мы перезвоним.',
    );
  }

  if (done) {
    return (
      <div
        ref={doneRef}
        role="status"
        tabIndex={-1}
        data-guest-order-done
        className="flex scroll-mt-24 flex-col gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 outline-none"
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
      {autoCategory.auto && <AutoCategoryNote name={categoryName} inputId={categoryInputId} />}

      <CategorySelect
        id={categoryInputId}
        label="Техника"
        categories={categories}
        value={categoryId}
        onChange={autoCategory.pick}
        emptyLabel="Подобрать по описанию"
        className="rounded-md border border-slate-300 px-3 py-2"
      />
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
      <OrderEstimate categoryName={categoryName} startDate={startDate} endDate={endDate} />

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
      <PointPicker
        value={point}
        onPick={(next) => {
          setPoint(next);
          // The street part stays as a label; the point is what gets located.
          setAddress((current) => addressWithPoint(current, next));
        }}
      />

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
      <PromiseNote />
      <p className="text-xs text-slate-500">
        Телефон видят только исполнители, которые нажмут «Показать телефон» — каждый показ
        записывается. Публично номер не показывается.
      </p>
    </form>
  );
}
