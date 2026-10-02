'use client';

import { useState } from 'react';

export function LinkOwnerForm() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    const response = await fetch('/api/admin/link-owner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const body = await response.json().catch(() => null);
    setIsSubmitting(false);
    setMessage(
      response.ok
        ? {
            ok: true,
            text: `Готово: аккаунт управляет парком ${body?.company ?? ''}. Выйдите и войдите снова, затем откройте «Поставщикам».`,
          }
        : { ok: false, text: typeof body?.error === 'string' ? body.error : 'Ошибка' },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="ym-hide-content flex flex-col gap-2 sm:flex-row">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="e-mail зарегистрированного аккаунта"
        aria-label="E-mail аккаунта"
        className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        Сделать управляющим парком
      </button>
      {message && (
        <p className={`text-sm sm:basis-full ${message.ok ? 'text-emerald-700' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}
