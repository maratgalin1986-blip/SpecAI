'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button, Card } from '@specai/ui';
import { CinemaBackdrop } from '@/components/CinemaHero';
import { BasePicker, type BaseValue } from '@/components/BasePicker';
import { ConsentText } from '@/components/ConsentText';
import { Hint } from '@/components/Hint';
import { normalizeReferralCode } from '@/lib/referral';
import { useHydrated } from '@/lib/useHydrated';
import { accountTypeFromQuery, WELCOME_PATHS, type AccountType } from '@/lib/welcome';

export default function RegisterPage() {
  // /register?role=provider|customer (the welcome cards, /login) and the
  // older ?type=provider open that form directly. Read after mounting, so
  // the server and the first client render match.
  const [accountType, setAccountType] = useState<AccountType>('CUSTOMER');
  // «Пригласи коллегу»: the inviter's code from /r/<code> or ?ref=.
  const [referralCode, setReferralCode] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preset = accountTypeFromQuery(params);
    if (preset) setAccountType(preset);
    setReferralCode(normalizeReferralCode(params.get('ref')));
  }, []);
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  // 152-ФЗ ст. 10.1: a provider's card (name, base address and point, machines)
  // is public, which needs a consent to distribution separate from `consent`.
  const [publicConsent, setPublicConsent] = useState(false);
  const [base, setBase] = useState<BaseValue>({ address: '', lat: null, lon: null });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hydrated = useHydrated();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (accountType === 'PROVIDER' && base.lat === null && base.address.trim().length < 3) {
      setError('Укажите адрес базы или поставьте точку на карте — по ней вас найдут заказчики');
      return;
    }
    if (accountType === 'PROVIDER' && !publicConsent) {
      setError('Нужно согласие на публикацию карточки компании');
      return;
    }
    setIsSubmitting(true);

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountType,
        ...(accountType === 'PROVIDER'
          ? {
              companyName,
              baseAddress: base.address.trim(),
              ...(base.lat !== null && base.lon !== null
                ? { baseLat: base.lat, baseLon: base.lon }
                : {}),
            }
          : {}),
        name,
        email,
        password,
        ...(phone ? { phone } : {}),
        ...(referralCode ? { ref: referralCode } : {}),
        consent,
      }),
    });

    if (!response.ok) {
      setIsSubmitting(false);
      const body = await response.json().catch(() => null);
      setError(typeof body?.error === 'string' ? body.error : 'Не удалось зарегистрироваться');
      return;
    }

    // Sign straight in and go to the right cabinet.
    await signIn('credentials', {
      email,
      password,
      callbackUrl: accountType === 'PROVIDER' ? '/provider' : '/dashboard',
    });
  }

  return (
    <div className="mx-auto max-w-sm py-6 sm:py-12">
      <CinemaBackdrop clip="frame-sunset" />
      <Card className="cine-sub shadow-2xl">
        <h1 className="cine-title mb-1 text-xl font-bold">Создать аккаунт</h1>
        <p className="mb-4 text-sm text-slate-600">
          Что вам нужно? Всё бесплатно: регистрация, заявки и выход на линию.
        </p>
        {referralCode && (
          <p className="mb-4 rounded-md bg-signal-50 px-3 py-2 text-sm text-graphite-800">
            Вас пригласил коллега — регистрация, заявки и предложения бесплатны.
          </p>
        )}

        <Hint id="register" className="mb-3" />
        {/* «Приветствие перед входом» (owner, 2026-10-17): two paths, one form. */}
        <div role="radiogroup" aria-label="Тип аккаунта" className="mb-4 flex flex-col gap-2">
          {WELCOME_PATHS.map((path) => {
            const active = accountType === path.accountType;
            return (
              <button
                key={path.accountType}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setAccountType(path.accountType)}
                className={`min-h-11 rounded-lg border px-3 py-2.5 text-left ${
                  active
                    ? 'border-amber-600 bg-amber-50 ring-1 ring-amber-600'
                    : 'border-slate-300 bg-white hover:border-amber-400'
                }`}
              >
                <span
                  className={`block text-base font-semibold ${active ? 'text-amber-800' : 'text-slate-800'}`}
                >
                  {path.title}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-slate-600">
                  {path.text}
                </span>
              </button>
            );
          })}
        </div>
        {accountType === 'CUSTOMER' && (
          <p className="mb-3 text-xs text-slate-500">
            Нужна машина один раз и без аккаунта?{' '}
            <a href="/orders" className="font-medium text-amber-700 underline">
              Оставьте заявку как гость
            </a>
          </p>
        )}

        <form method="post" onSubmit={handleSubmit} className="ym-hide-content flex flex-col gap-3">
          {accountType === 'PROVIDER' && (
            <label className="flex flex-col gap-1 text-sm">
              Название компании или ИП
              <input
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
          )}
          {accountType === 'PROVIDER' && (
            <div className="flex flex-col gap-1 text-sm">
              <span>
                Где стоит техника <span className="text-red-600">*</span>
              </span>
              <span className="text-xs text-slate-500">
                Адрес базы или стоянки — по нему заказчики увидят вас на карте и выберут ближайшего.
                Телефон и e-mail на карте не показываются.
              </span>
              <BasePicker value={base} onChange={setBase} />
            </div>
          )}
          <label className="flex flex-col gap-1 text-sm">
            Имя
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            E-mail
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Телефон <span className="text-slate-400">(необязательно)</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={30}
              autoComplete="tel"
              placeholder="+7 (___) ___-__-__"
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Пароль <span className="text-slate-400">(минимум 8 символов)</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
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
          {accountType === 'PROVIDER' && (
            <label className="flex items-start gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                required
                checked={publicConsent}
                onChange={(e) => setPublicConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Согласен(на), что название компании, город, адрес базы и её точка на карте, техника,
                цены и фото будут видны всем посетителям (
                <a href="/soglasie-rasprostranenie" className="underline" target="_blank">
                  согласие на распространение
                </a>
                )
              </span>
            </label>
          )}
          <p className="text-xs text-slate-500">
            Создавая аккаунт, вы принимаете{' '}
            <a href="/pravila" className="underline" target="_blank">
              Правила площадки
            </a>
            {accountType === 'CUSTOMER' ? (
              <>
                . Отзывы и комментарии публикуются с именем в виде «Анна П.» (
                <a href="/soglasie-rasprostranenie" className="underline" target="_blank">
                  согласие на распространение
                </a>
                )
              </>
            ) : null}
            .
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" disabled={!hydrated || isSubmitting}>
            {isSubmitting ? 'Создание аккаунта…' : 'Создать аккаунт'}
          </Button>
        </form>
        <p className="mt-4 text-sm text-slate-500">
          Уже есть аккаунт?{' '}
          <a href="/login" className="font-medium text-amber-700">
            Войти
          </a>
        </p>
      </Card>
    </div>
  );
}
