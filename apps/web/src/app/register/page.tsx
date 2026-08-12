'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@specai/ui';

type AccountType = 'CUSTOMER' | 'PROVIDER';

export default function RegisterPage() {
  const router = useRouter();
  const [accountType, setAccountType] = useState<AccountType>('CUSTOMER');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountType,
        name,
        email,
        password,
        ...(accountType === 'PROVIDER' ? { companyName } : {}),
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(typeof body?.error === 'string' ? body.error : 'Не удалось зарегистрироваться');
      return;
    }

    router.push('/login');
  }

  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <h1 className="mb-4 text-xl font-bold">Создать аккаунт</h1>

        <div className="mb-4 flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setAccountType('CUSTOMER')}
            className={`flex-1 rounded-md border px-3 py-2 font-medium ${
              accountType === 'CUSTOMER'
                ? 'border-amber-600 bg-amber-50 text-amber-800'
                : 'border-slate-300 text-slate-600'
            }`}
          >
            Хочу арендовать технику
          </button>
          <button
            type="button"
            onClick={() => setAccountType('PROVIDER')}
            className={`flex-1 rounded-md border px-3 py-2 font-medium ${
              accountType === 'PROVIDER'
                ? 'border-amber-600 bg-amber-50 text-amber-800'
                : 'border-slate-300 text-slate-600'
            }`}
          >
            Хочу сдавать технику
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Имя
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          {accountType === 'PROVIDER' && (
            <label className="flex flex-col gap-1 text-sm">
              Название компании
              <input
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
          )}
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
            Пароль
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2"
            />
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
