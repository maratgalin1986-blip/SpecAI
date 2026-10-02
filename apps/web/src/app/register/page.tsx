'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button, Card } from '@specai/ui';
import { CinemaBackdrop } from '@/components/CinemaHero';
import { BasePicker, type BaseValue } from '@/components/BasePicker';

type AccountType = 'CUSTOMER' | 'PROVIDER';

export default function RegisterPage() {
  // /register?type=provider opens the provider form directly.
  // Read after mounting, so the server and the first client render match.
  const [accountType, setAccountType] = useState<AccountType>('CUSTOMER');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('type') === 'provider') {
      setAccountType('PROVIDER');
    }
  }, []);
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [base, setBase] = useState<BaseValue>({ address: '', lat: null, lon: null });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (accountType === 'PROVIDER' && base.lat === null && base.address.trim().length < 3) {
      setError('Укажите адрес базы или поставьте точку на карте — по ней вас найдут заказчики');
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
        <h1 className="cine-title mb-4 text-xl font-bold">Создать аккаунт</h1>

        <div className="mb-4 flex flex-col gap-2 text-sm sm:flex-row">
          {(
            [
              ['CUSTOMER', 'Хочу арендовать технику'],
              ['PROVIDER', 'Хочу сдавать технику'],
            ] as const
          ).map(([type, label]) => (
            <button
              key={type}
              type="button"
              onClick={() => setAccountType(type)}
              className={`flex-1 rounded-md border px-3 py-2 font-medium ${
                accountType === type
                  ? 'border-amber-600 bg-amber-50 text-amber-800'
                  : 'border-slate-300 text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
            <span>
              Согласен(на) на обработку персональных данных в соответствии с{' '}
              <a href="/privacy" target="_blank" className="text-amber-700 underline">
                политикой конфиденциальности
              </a>
            </span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={isSubmitting}>
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
