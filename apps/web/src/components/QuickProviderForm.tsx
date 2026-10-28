'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button } from '@specai/ui';
import { CategorySelect, type SelectableCategory } from '@/components/CategorySelect';
import { ConsentText } from '@/components/ConsentText';
import { PromiseNote } from '@/components/PromiseNote';
import { useHydrated } from '@/lib/useHydrated';

/** Позиция телефона один раз, с согласия браузера; null — отказ или нет за 6 с. */
function currentPosition(): Promise<{ lat: number; lon: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 10 * 60_000 },
    );
  });
}

/**
 * «Встать на линию — попробовать бесплатно» (owner, 2026-10-28): имя, телефон
 * и вид техники. Где стоит машина — по позиции телефона (браузер спросит), а
 * если её нет — одно поле «город». Реквизиты, СТС и ИНН — потом, после
 * первого заказа, в кабинете.
 */
export function QuickProviderForm({ onFullForm }: { onFullForm: () => void }) {
  const hydrated = useHydrated();
  const [categories, setCategories] = useState<SelectableCategory[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [city, setCity] = useState('');
  const [needCity, setNeedCity] = useState(false);
  const [consent, setConsent] = useState(false);
  const [publicConsent, setPublicConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/categories')
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { categories?: SelectableCategory[] } | null) =>
        setCategories(body?.categories ?? []),
      )
      .catch(() => setCategories([]));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!categoryId) {
      setError('Выберите вид техники');
      return;
    }
    if (needCity && city.trim().length < 2) {
      setError('Укажите город, где стоит техника');
      return;
    }
    setBusy(true);
    const point = needCity ? null : await currentPosition();
    if (!point && !city.trim()) {
      setNeedCity(true);
      setBusy(false);
      setError('Не удалось узнать, где вы. Укажите город, где стоит техника');
      return;
    }
    let timeZone: string | undefined;
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      timeZone = undefined;
    }
    const response = await fetch('/api/auth/quick-provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        phone,
        categoryId,
        consent,
        publicConsent,
        ...(point ? { lat: point.lat, lon: point.lon } : { city: city.trim() }),
        ...(timeZone ? { timeZone } : {}),
      }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      error?: string;
      needCity?: boolean;
      quickToken?: string;
    } | null;
    if (!response?.ok || !body?.quickToken) {
      setBusy(false);
      if (body?.needCity) setNeedCity(true);
      setError(body?.error ?? 'Нет связи. Проверьте интернет и попробуйте ещё раз');
      return;
    }
    await signIn('quick', { token: body.quickToken, callbackUrl: '/provider?welcome=quick' });
  }

  return (
    <form onSubmit={submit} className="ym-hide-content flex flex-col gap-3">
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Три поля — и машина на линии на 5 рабочих дней. Реквизиты и документы — потом, после первого
        заказа.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Имя
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoComplete="name"
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Телефон
        <input
          type="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={30}
          autoComplete="tel"
          placeholder="+7 (___) ___-__-__"
          className="rounded-md border border-slate-300 px-3 py-2"
        />
        <span className="text-xs text-slate-500">
          Телефон не показывается на карте. Пока он не подтверждён — так и написано в карточке.
        </span>
      </label>
      <CategorySelect
        categories={categories}
        value={categoryId}
        onChange={setCategoryId}
        emptyLabel="Выберите вид техники"
        label="Вид техники"
        placeholder="Например: экскаватор-погрузчик"
        className="rounded-md border border-slate-300 px-3 py-2"
      />
      {needCity && (
        <label className="flex flex-col gap-1 text-sm">
          Город, где стоит техника
          <input
            required
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={120}
            placeholder="Например: Набережные Челны"
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      )}
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
      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          required
          checked={publicConsent}
          onChange={(e) => setPublicConsent(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Согласен(на), что имя, вид техники и место на карте будут видны всем посетителям с
          пометкой «Новый исполнитель, данные не проверены» (
          <a href="/soglasie-rasprostranenie" className="underline" target="_blank">
            согласие на распространение
          </a>
          ). Создавая аккаунт, принимаю{' '}
          <a href="/pravila" className="underline" target="_blank">
            Правила площадки
          </a>
          .
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" disabled={!hydrated || busy}>
        {busy ? 'Ставим на линию…' : 'Встать на линию — попробовать бесплатно'}
      </Button>
      <PromiseNote />
      <button
        type="button"
        onClick={onFullForm}
        className="min-h-11 text-left text-sm font-medium text-amber-700 underline"
      >
        Сразу полная регистрация: компания, e-mail и пароль
      </button>
    </form>
  );
}
