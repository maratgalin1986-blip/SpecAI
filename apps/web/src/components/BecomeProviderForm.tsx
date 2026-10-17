'use client';

import { useState } from 'react';
import { BasePicker, type BaseValue } from '@/components/BasePicker';
import { PromiseNote } from '@/components/PromiseNote';
import { modeCookie } from '@/lib/cabinetMode';
import { useHydrated } from '@/lib/useHydrated';

/** Where a new provider lands: its page with a nudge to add the first machine. */
export const BECOME_PROVIDER_DONE_HREF = '/provider?welcome=1';

/**
 * «Стать исполнителем» under the same login (POST /api/account/provider): the
 * company or own name, where the machinery stands (as at sign-up) and an
 * optional phone. Orders and bookings stay in the customer mode.
 */
export function BecomeProviderForm() {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [base, setBase] = useState<BaseValue>({ address: '', lat: null, lon: null });
  // 152-ФЗ ст. 10.1: the provider card is public, as at sign-up.
  const [publicConsent, setPublicConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (base.lat === null && base.address.trim().length < 3) {
      setError('Укажите адрес, где стоит техника, или поставьте точку на карте');
      return;
    }
    if (!publicConsent) {
      setError('Нужно согласие на публикацию карточки исполнителя');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/account/provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: companyName.trim(),
          publicConsent: true,
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          baseAddress: base.address.trim(),
          ...(base.lat !== null && base.lon !== null
            ? { baseLat: base.lat, baseLon: base.lon }
            : {}),
        }),
      });
      // 409: the account already is a provider (a second tab) — go there too.
      if (response.ok || response.status === 409) {
        try {
          document.cookie = modeCookie('provider');
        } catch {
          // Cookies blocked: /provider opens anyway.
        }
        // A full load: the header reads the new role from a fresh session.
        window.location.assign(BECOME_PROVIDER_DONE_HREF);
        return;
      }
      const body = await response.json().catch(() => null);
      setError(typeof body?.error === 'string' ? body.error : 'Не получилось, попробуйте ещё раз');
    } catch {
      setError('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз');
    }
    setSubmitting(false);
  }

  return (
    <section
      id="become-provider"
      aria-labelledby="become-provider-title"
      className="cab-card flex scroll-mt-24 flex-col gap-3"
    >
      <div>
        <h2 id="become-provider-title" className="text-lg font-bold text-graphite-950">
          Стать исполнителем
        </h2>
        <p className="mt-1 text-sm text-graphite-600">
          Добавьте свою технику и получайте заявки — под этим же логином. Ваши заказы останутся
          здесь, переключаться можно в одно касание.
        </p>
        <PromiseNote className="mt-1" />
      </div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cab-ghost min-h-11 w-fit"
          aria-expanded={false}
          aria-controls="become-provider-form"
        >
          Добавить свою технику
        </button>
      ) : (
        <form
          id="become-provider-form"
          method="post"
          onSubmit={handleSubmit}
          className="ym-hide-content flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1 text-sm">
            Название компании или ваше имя
            <input
              required
              maxLength={200}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              autoComplete="organization"
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <span>
              Где стоит техника <span className="text-red-600">*</span>
            </span>
            <span className="text-xs text-slate-500">
              Адрес базы или стоянки — по нему заказчики увидят вас на карте. Телефон и e-mail на
              карте не показываются.
            </span>
            <BasePicker value={base} onChange={setBase} />
          </div>
          <label className="flex flex-col gap-1 text-sm">
            Телефон для заказчиков <span className="text-slate-400">(необязательно)</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={30}
              autoComplete="tel"
              placeholder="+7 (___) ___-__-__"
              className="rounded-md border border-slate-300 px-3 py-2"
            />
            <span className="text-xs text-slate-500">
              Заказчик увидит его только после того, как вы подтвердите бронь.
            </span>
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
              Согласен(на), что название, город, адрес базы и её точка на карте, техника, цены и
              фото будут видны всем посетителям (
              <a href="/soglasie-rasprostranenie" className="underline" target="_blank">
                согласие на распространение
              </a>
              )
            </span>
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!hydrated || submitting}
              className="cab-action min-h-11 disabled:opacity-60"
            >
              {submitting ? 'Сохраняем…' : 'Стать исполнителем'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-11 rounded-full px-4 text-sm font-medium text-graphite-600 hover:bg-graphite-100"
            >
              Отмена
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
