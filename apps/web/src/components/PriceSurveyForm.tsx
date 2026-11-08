'use client';

import { useMemo, useState } from 'react';
import { CATEGORIES, CATEGORY_GROUPS, RUSSIAN_CITIES } from '@specai/shared';
import { ConsentText } from '@/components/ConsentText';
import { useHydrated } from '@/lib/useHydrated';

const INPUT = 'min-h-11 w-full rounded-md border bg-white px-3 py-2 text-base sm:text-sm';

interface Answer {
  text: string;
  wantsOrders?: boolean;
}

/**
 * «Узнай цены в своём городе»: three questions (machine, city, price per hour)
 * and, optionally, who you are — then the colleagues' prices at once
 * (POST /api/ceny/opros). Name, company and phone go only with the consent tick.
 */
export function PriceSurveyForm({ defaultCategory }: { defaultCategory?: string }) {
  const hydrated = useHydrated();
  const cities = useMemo(
    () => [...RUSSIAN_CITIES].map((city) => city.name).sort((a, b) => a.localeCompare(b, 'ru')),
    [],
  );
  const groups = useMemo(
    () =>
      CATEGORY_GROUPS.map((group) => ({
        ...group,
        items: CATEGORIES.filter((category) => category.group === group.slug),
      })),
    [],
  );
  const [categorySlug, setCategorySlug] = useState(defaultCategory ?? '');
  const [city, setCity] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [wantsOrders, setWantsOrders] = useState(false);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const personal = Boolean(companyName.trim() || contactName.trim() || phone.trim());

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSending(true);
    try {
      const response = await fetch('/api/ceny/opros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categorySlug,
          city,
          hourlyRate: hourlyRate.replace(/\s/g, ''),
          companyName,
          contactName,
          phone,
          wantsOrders,
          consent,
          website,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        (Answer & { error?: string }) | null;
      if (!response.ok || !body) throw new Error(body?.error ?? 'Не удалось отправить ответ');
      setAnswer(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить ответ');
    } finally {
      setSending(false);
    }
  }

  if (answer) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <p className="text-lg font-bold text-slate-900">Спасибо! Цены коллег:</p>
        <p className="text-slate-700">{answer.text}</p>
        {answer.wantsOrders && (
          <p className="text-sm text-slate-700">
            Хотите получать заявки рядом?{' '}
            <a href="/register?role=provider" className="font-semibold text-amber-700 underline">
              Зарегистрируйтесь как исполнитель
            </a>{' '}
            — это бесплатно.
          </p>
        )}
        <div className="flex flex-wrap gap-3 text-sm">
          <a href="/ceny" className="font-semibold text-amber-700 underline">
            Все цены на рынке
          </a>
          <button
            type="button"
            className="font-semibold text-slate-600 underline"
            onClick={() => {
              setAnswer(null);
              setHourlyRate('');
            }}
          >
            Ответить про другую технику
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
        1. Вид техники
        <select
          className={INPUT}
          required
          value={categorySlug}
          onChange={(event) => setCategorySlug(event.target.value)}
        >
          <option value="">Выберите…</option>
          {groups.map((group) => (
            <optgroup key={group.slug} label={group.name}>
              {group.items.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
        2. Город
        <select
          className={INPUT}
          required
          value={city}
          onChange={(event) => setCity(event.target.value)}
        >
          <option value="">Выберите…</option>
          {cities.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
        3. Ваша цена за час с машинистом, ₽
        <input
          className={INPUT}
          inputMode="numeric"
          required
          placeholder="Например, 3000"
          value={hourlyRate}
          onChange={(event) => setHourlyRate(event.target.value)}
        />
      </label>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-sm text-slate-600">Необязательно</legend>
        <input
          className={INPUT}
          placeholder="Компания"
          autoComplete="organization"
          value={companyName}
          onChange={(event) => setCompanyName(event.target.value)}
        />
        <input
          className={INPUT}
          placeholder="Имя"
          autoComplete="name"
          value={contactName}
          onChange={(event) => setContactName(event.target.value)}
        />
        <input
          className={INPUT}
          placeholder="Телефон"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 accent-amber-600"
            checked={wantsOrders}
            onChange={(event) => setWantsOrders(event.target.checked)}
          />
          <span>Хочу получать заявки рядом</span>
        </label>
        {personal && (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 accent-amber-600"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <ConsentText />
          </label>
        )}
      </fieldset>

      {/* A field people never see: bots fill it. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="hidden"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={!hydrated || sending} className="cab-action w-full sm:w-fit">
        {sending ? 'Отправляем…' : 'Показать цены коллег'}
      </button>
      <p className="text-xs text-slate-500">
        Ответы обезличены: на странице цен — только средние числа, где ответили не меньше трёх
        разных исполнителей. Без имени и телефона мы храним только вид техники, город, цену и
        обезличенную метку от повторных ответов.
      </p>
    </form>
  );
}
