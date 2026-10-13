'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Preview = {
  name: string;
  email: string;
  role: string;
  company: string | null;
  warnings: string[];
};

// Two steps (api/admin/link-owner): «Проверить» shows whose account it is,
// «Да, привязать» changes it. A changed e-mail drops the preview.
export function LinkOwnerForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function send(confirm: boolean) {
    setIsSubmitting(true);
    setMessage(null);
    const response = await fetch('/api/admin/link-owner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, confirm }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setIsSubmitting(false);
    if (!response?.ok) {
      setPreview(null);
      setMessage({ ok: false, text: typeof body?.error === 'string' ? body.error : 'Ошибка' });
      return;
    }
    if (body?.preview) {
      setPreview(body.preview as Preview);
      return;
    }
    setPreview(null);
    setMessage({
      ok: true,
      text: body?.already
        ? `Этот аккаунт уже управляет парком ${body?.company ?? ''}.`
        : `Готово: аккаунт управляет парком ${body?.company ?? ''}. Выйдите и войдите снова, затем откройте кабинет исполнителя.`,
    });
    router.refresh();
  }

  return (
    <div className="ym-hide-content flex flex-col gap-2">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(false);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setPreview(null);
          }}
          placeholder="e-mail зарегистрированного аккаунта"
          aria-label="E-mail аккаунта"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Проверить аккаунт
        </button>
      </form>
      {preview && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p>
            <span className="font-semibold">{preview.name}</span> · {preview.email} · {preview.role}
            {preview.company ? ` · «${preview.company}»` : ''}
          </p>
          {preview.warnings.map((warning) => (
            <p key={warning} className="text-amber-800">
              {warning}
            </p>
          ))}
          <p className="text-slate-700">
            Аккаунт получит доступ к парку СпецПласт16, ценам и контактам заявок из чатов.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void send(true)}
              className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Да, сделать управляющим парком
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className={`text-sm ${message.ok ? 'text-emerald-700' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
