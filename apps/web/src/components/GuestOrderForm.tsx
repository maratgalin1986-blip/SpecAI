'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@specai/ui';
import dynamic from 'next/dynamic';
import { AutoCategoryNote, useAutoCategory } from '@/components/AutoCategory';
import { CategorySelect, type SelectableCategory } from '@/components/CategorySelect';
import { CONSENT_ERROR, ConsentCheck, focusFirstInvalid, PhoneInput } from '@/components/FormBits';
import { DemandHint } from '@/components/DemandHint';
import { OrderEstimate } from '@/components/OrderEstimate';
import { PointPicker } from '@/components/PointPicker';
import { noteInstallMoment } from '@/lib/installHint';
import { addressWithPoint, type MapPoint } from '@/lib/mapPoint';
import { onOrderPrefill, withPrefillLine } from '@/lib/orderPrefillEvent';
import { SITE } from '@/lib/site';
import { PromiseNote } from '@/components/PromiseNote';
import type { OrderPrefill } from '@/lib/quickOrder';
import { phoneError } from '@/lib/phoneMask';
import { ANONYMOUS_LEAD_NAME } from '@/lib/submitLead';

// The celebration is only needed once the заявка is sent: its own small chunk.
const Celebrate = dynamic(() => import('@/components/Celebrate').then((m) => m.Celebrate), {
  ssr: false,
});

/** Today's date in Moscow as YYYY-MM-DD, the earliest allowed order date. */
function todayInMoscow() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
}

type Category = SelectableCategory;

/** The order's text when the guest left only the machine and a phone. */
export function shortOrderText(categoryName: string | undefined): string {
  return categoryName
    ? `Нужна техника: ${categoryName}. Задачу, день и адрес уточнить по телефону.`
    : 'Нужна спецтехника. Какая, на когда и куда — уточнить по телефону.';
}

const FIELD = 'min-h-11 rounded-md border border-slate-300 px-3 py-2 text-base';

/**
 * The order form for visitors without an account (/orders). The first step
 * is short: the machine type, a phone and the consent — that is enough for
 * the заявка. The task, the dates, the address and a name are under «Уточнить
 * детали» and may stay empty: the API needs a text and a day (createGuestOrderSchema),
 * so the form sends «уточнить по телефону» and today's date for them.
 * POST /api/orders/guest puts the order on the board; providers bid, the
 * dispatcher calls back with the best offers.
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
  const providerLine = provider ? `Для исполнителя «${provider.name}». ` : '';
  const [description, setDescription] = useState(providerLine + (initial?.description ?? ''));
  // Came with a date, an address or a task already (the cabinet's quick order,
  // «Заказать» on a machine): the details are open.
  const [detailsOpen, setDetailsOpen] = useState(
    Boolean(initial?.startDate || initial?.address || initial?.description),
  );
  const [fieldErrors, setFieldErrors] = useState<{ phone?: string; consent?: string }>({});
  const formRef = useRef<HTMLFormElement>(null);
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
  const phoneInputId = useId();
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
      .then((data) => {
        const list: Category[] = data.categories ?? [];
        setCategories(list);
        // A link may name the type by its slug (/orders?category=excavators).
        setCategoryId((current) => list.find((row) => row.slug === current)?.id ?? current);
      })
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
        setDetailsOpen(true);
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

  const categoryName = categories.find((category) => category.id === categoryId)?.name;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const problems = {
      phone: phoneError(phone) ?? undefined,
      consent: consent ? undefined : CONSENT_ERROR,
    };
    setFieldErrors(problems);
    if (problems.phone || problems.consent) {
      focusFirstInvalid(formRef.current);
      return;
    }
    const start = startDate || todayInMoscow();
    const typed = description.trim();
    const text =
      typed && typed !== providerLine.trim() ? typed : providerLine + shortOrderText(categoryName);
    setIsSubmitting(true);
    let response: Response;
    try {
      response = await fetch('/api/orders/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: text,
          desiredStartDate: start,
          desiredEndDate: endDate && endDate >= start ? endDate : start,
          categoryId: categoryId || undefined,
          address: address.trim() || undefined,
          name: name.trim() || ANONYMOUS_LEAD_NAME,
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
        className="show-glow flex scroll-mt-24 flex-col gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 outline-none"
      >
        <Celebrate />
        <p className="font-semibold">Заявка принята</p>
        <p>{done}</p>
        <p className="text-xs text-green-800">
          Что дальше: исполнители сервиса видят заявку в своём приложении и предлагают цену,
          диспетчер {SITE.name} сравнит предложения и перезвонит вам по номеру {phone}.
        </p>
        <p className="text-sm">
          Не хотите ждать — позвоните сами:{' '}
          <a
            href={SITE.phoneHref}
            data-order-done-phone
            className="inline-flex min-h-11 items-center font-mono text-base font-bold tabular-nums text-green-950 underline underline-offset-2"
          >
            {SITE.phone}
          </a>
        </p>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      data-guest-order-form
      className="ym-hide-content flex flex-col gap-3"
    >
      <CategorySelect
        id={categoryInputId}
        label="Техника"
        categories={categories}
        value={categoryId}
        onChange={autoCategory.pick}
        emptyLabel="Не знаю — подберите"
        className={FIELD}
      />
      {autoCategory.auto && <AutoCategoryNote name={categoryName} inputId={categoryInputId} />}
      <DemandHint categoryId={categoryId} categoryName={categoryName} />

      <label className="flex flex-col gap-1 text-sm" htmlFor={phoneInputId}>
        Телефон
      </label>
      <PhoneInput
        id={phoneInputId}
        value={phone}
        onChange={(next) => {
          setPhone(next);
          if (fieldErrors.phone) setFieldErrors((current) => ({ ...current, phone: undefined }));
        }}
        error={fieldErrors.phone}
        className={`${FIELD} -mt-2 w-full`}
      />

      <details
        data-order-details
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
        className="rounded-md border border-slate-200 bg-slate-50 px-3"
      >
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-slate-800">
          Уточнить детали
          <span className="ml-1 font-normal text-slate-500">— необязательно</span>
        </summary>
        <div className="flex flex-col gap-3 pb-3">
          <label className="flex flex-col gap-1 text-sm">
            Что нужно сделать
            <textarea
              rows={3}
              maxLength={2000}
              placeholder="Например: нужен экскаватор для рытья траншеи 50 м, мягкий грунт"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={FIELD}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Нужна с
              <input
                type="date"
                min={todayInMoscow()}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={`${FIELD} min-w-0`}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              По
              <input
                type="date"
                min={startDate || todayInMoscow()}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={`${FIELD} min-w-0`}
              />
            </label>
          </div>
          <OrderEstimate categoryName={categoryName} startDate={startDate} endDate={endDate} />

          <label className="flex flex-col gap-1 text-sm">
            Адрес работ
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Город, улица, дом"
              autoComplete="street-address"
              maxLength={200}
              className={FIELD}
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
          <label className="flex flex-col gap-1 text-sm">
            Как к вам обращаться
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={100}
              className={FIELD}
            />
          </label>
        </div>
      </details>

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

      <ConsentCheck
        checked={consent}
        onChange={(next) => {
          setConsent(next);
          if (next) setFieldErrors((current) => ({ ...current, consent: undefined }));
        }}
        error={fieldErrors.consent}
      />

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting} className="min-h-11">
        {isSubmitting ? 'Публикация…' : 'Опубликовать заявку'}
      </Button>
      <p className="text-sm text-slate-700">
        Проще голосом?{' '}
        <a
          href={SITE.phoneHref}
          data-order-phone
          className="inline-flex min-h-11 items-center font-mono text-base font-bold tabular-nums text-slate-950 underline underline-offset-2"
        >
          {SITE.phone}
        </a>
      </p>
      <PromiseNote />
      <p className="text-xs text-slate-500">
        Телефон видят только исполнители, которые нажмут «Показать телефон» — каждый показ
        записывается. Публично номер не показывается.
      </p>
    </form>
  );
}
