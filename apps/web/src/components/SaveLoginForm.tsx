'use client';

import { useState } from 'react';

/**
 * Аккаунт после лёгкой формы входит только с этого устройства: здесь он
 * задаёт e-mail и пароль, чтобы входить с любого телефона и компьютера.
 */
export function SaveLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch('/api/account/login-details', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!response?.ok) {
      setError(body?.error ?? 'Нет связи, попробуйте ещё раз');
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
        Вход сохранён: теперь можно входить по e-mail и паролю с любого устройства.
      </p>
    );
  }
  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"
    >
      <p className="font-semibold text-amber-900">Сохраните вход</p>
      <p className="text-amber-900">
        Сейчас вы вошли только на этом устройстве. Укажите e-mail и пароль — чтобы не потерять
        аккаунт и входить с других.
      </p>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="E-mail"
        aria-label="E-mail"
        autoComplete="email"
        className="rounded-md border border-slate-300 px-3 py-2"
      />
      <input
        type="password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Пароль, минимум 8 символов"
        aria-label="Пароль"
        autoComplete="new-password"
        className="rounded-md border border-slate-300 px-3 py-2"
      />
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="cab-action w-fit">
        {busy ? 'Сохраняем…' : 'Сохранить вход'}
      </button>
    </form>
  );
}
