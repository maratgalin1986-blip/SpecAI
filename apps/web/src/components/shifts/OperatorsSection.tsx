'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi, errorText, type OperatorJson } from './client';

// «Машинисты» in /provider: the company's operators with add / edit /
// deactivate and the sign-in (e-mail + temporary password) the admin creates
// for the app. The password is typed here and handed over in person — the
// server never sends it anywhere.

interface FormState {
  name: string;
  phone: string;
  licenseNumber: string;
  email: string;
  password: string;
}

const EMPTY: FormState = { name: '', phone: '', licenseNumber: '', email: '', password: '' };

const field =
  'w-full rounded-md border border-graphite-200 px-2 py-1.5 text-sm text-graphite-900 placeholder:text-graphite-400';

function OperatorForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FormState;
  submitLabel: string;
  onSubmit: (form: FormState) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (caught) {
      setError(errorText(caught, 'Не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          required
          value={form.name}
          onChange={set('name')}
          placeholder="Имя машиниста"
          maxLength={200}
          className={field}
        />
        <input
          value={form.phone}
          onChange={set('phone')}
          placeholder="Телефон"
          maxLength={30}
          className={field}
        />
        <input
          value={form.licenseNumber}
          onChange={set('licenseNumber')}
          placeholder="Удостоверение (№)"
          maxLength={60}
          className={field}
        />
      </div>
      <p className="text-xs text-graphite-500">
        Вход в приложение: укажите e-mail и временный пароль, передайте их машинисту лично.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          type="email"
          value={form.email}
          onChange={set('email')}
          placeholder="E-mail для входа"
          maxLength={254}
          autoComplete="off"
          className={field}
        />
        <input
          type="text"
          value={form.password}
          onChange={set('password')}
          placeholder="Временный пароль (от 8 знаков)"
          minLength={8}
          maxLength={100}
          autoComplete="off"
          className={field}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className="cab-action">
          {saving ? '…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="cab-ghost">
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}

function payload(form: FormState) {
  return {
    name: form.name,
    phone: form.phone,
    licenseNumber: form.licenseNumber,
    ...(form.email.trim() ? { email: form.email, password: form.password } : {}),
  };
}

export function OperatorsSection({ initial }: { initial: OperatorJson[] }) {
  const router = useRouter();
  const [operators, setOperators] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upsert = (operator: OperatorJson) =>
    setOperators((prev) => {
      const exists = prev.some((row) => row.id === operator.id);
      const next = exists
        ? prev.map((row) => (row.id === operator.id ? operator : row))
        : [...prev, operator];
      return next.sort(
        (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'ru'),
      );
    });

  async function create(form: FormState) {
    const result = await callApi<{ operator: OperatorJson }>('/api/operators', {
      method: 'POST',
      body: payload(form),
    });
    upsert(result.operator);
    setAdding(false);
    router.refresh();
  }

  async function update(id: string, form: FormState) {
    const result = await callApi<{ operator: OperatorJson }>(`/api/operators/${id}`, {
      method: 'PATCH',
      body: payload(form),
    });
    upsert(result.operator);
    setEditing(null);
    router.refresh();
  }

  async function toggle(operator: OperatorJson) {
    if (
      operator.active &&
      !window.confirm(`Отключить машиниста ${operator.name}? Новые брони ему назначить нельзя.`)
    ) {
      return;
    }
    setBusy(operator.id);
    setError(null);
    try {
      const result = await callApi<{ operator: OperatorJson }>(`/api/operators/${operator.id}`, {
        method: 'PATCH',
        body: { active: !operator.active },
      });
      upsert(result.operator);
      router.refresh();
    } catch (caught) {
      setError(errorText(caught, 'Не удалось изменить'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id="operators" className="cab-card flex scroll-mt-24 flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-graphite-950">Машинисты</h2>
          <p className="text-sm text-graphite-600">
            Назначайте машиниста на бронь — в приложении он видит только свои заказы, ведёт статусы
            смены и табель.
          </p>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="cab-ghost">
            Добавить машиниста
          </button>
        )}
      </div>
      {adding && (
        <div className="rounded-xl bg-graphite-50 p-3">
          <OperatorForm
            initial={EMPTY}
            submitLabel="Добавить"
            onSubmit={create}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
      {operators.length === 0 ? (
        <p className="text-sm text-graphite-500">Машинистов пока нет.</p>
      ) : (
        <ul className="divide-y divide-graphite-100">
          {operators.map((operator) => (
            <li key={operator.id} className="flex flex-col gap-2 py-3">
              {editing === operator.id ? (
                <OperatorForm
                  initial={{
                    name: operator.name,
                    phone: operator.phone ?? '',
                    licenseNumber: operator.licenseNumber ?? '',
                    email: operator.email ?? '',
                    password: '',
                  }}
                  submitLabel="Сохранить"
                  onSubmit={(form) => update(operator.id, form)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p
                      className={`break-words text-sm font-semibold ${operator.active ? 'text-graphite-900' : 'text-graphite-400 line-through'}`}
                    >
                      {operator.name}
                    </p>
                    <p className="text-xs text-graphite-500">
                      {[
                        operator.phone,
                        operator.licenseNumber && `удостоверение ${operator.licenseNumber}`,
                        operator.email ? `вход: ${operator.email}` : 'без входа в приложение',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(operator.id)}
                      className="cab-ghost"
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      disabled={busy === operator.id}
                      onClick={() => void toggle(operator)}
                      className="cab-ghost"
                    >
                      {busy === operator.id ? '…' : operator.active ? 'Отключить' : 'Включить'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </section>
  );
}
