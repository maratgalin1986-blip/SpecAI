'use client';

import { useEffect, useState } from 'react';
import { LEGAL_FORMS, legalFormLabel, type LegalForm } from '@/lib/providerVerification';
import { cleanInn, innLengthFor, isValidInn } from '@/lib/inn';

interface Entity {
  id: string;
  legalForm: string;
  name: string;
  inn: string;
  kpp: string | null;
  address: string | null;
  isDefault: boolean;
}

const input = 'rounded-md border border-slate-300 px-3 py-2';

/**
 * «Реквизиты» заказчика: несколько организаций и ИП на один аккаунт,
 * переключатель «Заказываю от …». Видит только владелец аккаунта.
 */
export function LegalEntities() {
  const [entities, setEntities] = useState<Entity[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [legalForm, setLegalForm] = useState<LegalForm>('LEGAL');
  const [name, setName] = useState('');
  const [inn, setInn] = useState('');
  const [kpp, setKpp] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch('/api/account/legal-entities').catch(() => null);
    const body = (await response?.json().catch(() => null)) as { entities?: Entity[] } | null;
    setEntities(body?.entities ?? []);
  }
  useEffect(() => {
    void load();
  }, []);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (cleanInn(inn).length !== innLengthFor(legalForm) || !isValidInn(inn)) {
      setError(`ИНН с ошибкой: нужно ${innLengthFor(legalForm)} цифр с верной контрольной суммой`);
      return;
    }
    setBusy(true);
    const response = await fetch('/api/account/legal-entities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legalForm, name, inn, kpp, address }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!response?.ok) {
      setError(body?.error ?? 'Нет связи, попробуйте ещё раз');
      return;
    }
    setAdding(false);
    setName('');
    setInn('');
    setKpp('');
    setAddress('');
    await load();
  }

  async function choose(id: string) {
    await fetch('/api/account/legal-entities', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isDefault: true }),
    }).catch(() => null);
    await load();
  }

  async function remove(id: string) {
    if (!window.confirm('Удалить эти реквизиты?')) return;
    await fetch(`/api/account/legal-entities?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).catch(() => null);
    await load();
  }

  if (!entities) return <p className="text-sm text-graphite-500">Загружаем…</p>;
  const current = entities.find((entity) => entity.isDefault);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-graphite-600">
        {current
          ? `Заказываю от: ${current.name}`
          : 'Заказываете как частное лицо. Для счетов и актов на организацию добавьте реквизиты.'}
      </p>
      {entities.length > 0 && (
        <ul className="flex flex-col gap-2">
          {entities.map((entity) => (
            <li
              key={entity.id}
              className={`cab-card flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${
                entity.isDefault ? 'border-signal-400' : ''
              }`}
            >
              <div className="min-w-0 text-sm">
                <p className="break-words font-semibold text-graphite-950">{entity.name}</p>
                <p className="text-graphite-600">
                  {legalFormLabel(entity.legalForm)} · ИНН{' '}
                  <span className="font-mono">{entity.inn}</span>
                  {entity.kpp ? ` · КПП ${entity.kpp}` : ''}
                </p>
                {entity.address && (
                  <p className="break-words text-graphite-500">{entity.address}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {entity.isDefault ? (
                  <span className="cab-chip">Выбрано</span>
                ) : (
                  <button
                    type="button"
                    className="cab-action"
                    onClick={() => void choose(entity.id)}
                  >
                    Заказывать от этой
                  </button>
                )}
                <button
                  type="button"
                  className="min-h-11 px-2 text-sm text-graphite-500 underline"
                  onClick={() => void remove(entity.id)}
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form onSubmit={add} className="cab-card flex flex-col gap-2 text-sm">
          <select
            value={legalForm}
            onChange={(e) => setLegalForm(e.target.value as LegalForm)}
            aria-label="Форма"
            className={input}
          >
            {LEGAL_FORMS.map((form) => (
              <option key={form.id} value={form.id}>
                {form.label}
              </option>
            ))}
          </select>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder={legalForm === 'LEGAL' ? 'Название организации' : 'ФИО'}
            aria-label="Название"
            className={input}
          />
          <input
            required
            inputMode="numeric"
            value={inn}
            onChange={(e) => setInn(e.target.value)}
            maxLength={16}
            placeholder={`ИНН, ${innLengthFor(legalForm)} цифр`}
            aria-label="ИНН"
            className={`${input} font-mono`}
          />
          {legalForm === 'LEGAL' && (
            <input
              inputMode="numeric"
              value={kpp}
              onChange={(e) => setKpp(e.target.value)}
              maxLength={12}
              placeholder="КПП (необязательно)"
              aria-label="КПП"
              className={`${input} font-mono`}
            />
          )}
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={300}
            placeholder="Юридический адрес (необязательно)"
            aria-label="Адрес"
            className={input}
          />
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="cab-action">
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </button>
            <button
              type="button"
              className="min-h-11 px-2 text-graphite-600 underline"
              onClick={() => setAdding(false)}
            >
              Отмена
            </button>
          </div>
        </form>
      ) : (
        entities.length < 10 && (
          <button type="button" className="cab-action w-fit" onClick={() => setAdding(true)}>
            Добавить организацию или ИП
          </button>
        )
      )}
    </div>
  );
}
