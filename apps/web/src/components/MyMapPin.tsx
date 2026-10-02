'use client';

import { useState } from 'react';
import { BasePicker, type BaseValue } from '@/components/BasePicker';
import { PIN_NOTE_EXAMPLES, PIN_NOTE_MAX } from '@/lib/providerMap';

// «Моя точка на карте» in the provider cabinet: the base (address or point),
// the marker picture (standard icon, a photo of own machinery or a new
// upload) and a short note customers see on /map. Saved with
// PATCH /api/companies/me.

export interface MyPinCompany {
  baseLat: number | null;
  baseLon: number | null;
  baseAddress: string | null;
  pinImageUrl: string | null;
  pinNote: string | null;
}

export function MyMapPin({
  company,
  photos,
  uploadsEnabled,
}: {
  company: MyPinCompany;
  photos: string[];
  uploadsEnabled: boolean;
}) {
  const [base, setBase] = useState<BaseValue>({
    address: company.baseAddress ?? '',
    lat: company.baseLat,
    lon: company.baseLon,
  });
  const [image, setImage] = useState<string | null>(company.pinImageUrl);
  const [choices, setChoices] = useState<string[]>(() =>
    company.pinImageUrl && !photos.includes(company.pinImageUrl)
      ? [company.pinImageUrl, ...photos]
      : photos,
  );
  const [note, setNote] = useState(company.pinNote ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/uploads', { method: 'POST', body: form });
      const body = (await response.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;
      if (!response.ok || !body?.url) {
        setMessage({
          ok: false,
          text:
            response.status === 503
              ? 'Загрузка фото пока не настроена — выберите фото своей техники'
              : (body?.error ?? 'Не удалось загрузить фото'),
        });
        return;
      }
      const url = body.url;
      setChoices((prev) => [url, ...prev.filter((item) => item !== url)]);
      setImage(url);
    } catch {
      setMessage({ ok: false, text: 'Нет связи с сервером, попробуйте ещё раз' });
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/companies/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseAddress: base.address.trim(),
          ...(base.lat !== null && base.lon !== null
            ? { baseLat: base.lat, baseLon: base.lon }
            : {}),
          pinImageUrl: image,
          pinNote: note,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        company?: MyPinCompany;
        error?: string;
      } | null;
      if (!response.ok || !body?.company) {
        setMessage({ ok: false, text: body?.error ?? 'Не удалось сохранить' });
        return;
      }
      setBase({
        address: body.company.baseAddress ?? '',
        lat: body.company.baseLat,
        lon: body.company.baseLon,
      });
      setNote(body.company.pinNote ?? '');
      setMessage({ ok: true, text: 'Сохранено — так вас видят заказчики на карте' });
    } catch {
      setMessage({ ok: false, text: 'Нет связи с сервером, попробуйте ещё раз' });
    } finally {
      setSaving(false);
    }
  }

  const tile = (selected: boolean) =>
    `relative h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 transition ${
      selected ? 'ring-amber-500 ring-offset-2' : 'ring-slate-200 hover:ring-slate-400'
    }`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Адрес базы или точка на карте</span>
        <BasePicker value={base} onChange={setBase} imageUrl={image} />
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <span className="font-medium">Значок на карте</span>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setImage(null)}
            aria-pressed={image === null}
            title="Стандартный значок"
            className={`${tile(image === null)} flex items-center justify-center bg-slate-800 text-amber-400`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-8 w-8"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 17h11V11H8l-2 3H3z" />
              <path d="M14 13h3l3-6" />
              <path d="M20 7l1 4h-3" />
              <circle cx="6" cy="18" r="2" />
              <circle cx="12" cy="18" r="2" />
            </svg>
            <span className="sr-only">Стандартный значок</span>
          </button>
          {choices.map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => setImage(url)}
              aria-pressed={image === url}
              title="Фото техники"
              className={tile(image === url)}
            >
              <img
                src={url}
                alt="Фото техники"
                className="h-full w-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </button>
          ))}
          {uploadsEnabled && (
            <label
              className={`${tile(false)} flex cursor-pointer items-center justify-center bg-white text-center text-[0.65rem] font-semibold leading-tight text-slate-600`}
            >
              {uploading ? 'Загрузка…' : '+ Новое фото'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void upload(file);
                }}
              />
            </label>
          )}
        </div>
        <p className="text-xs text-slate-500">
          {choices.length === 0
            ? uploadsEnabled
              ? 'Загрузите фото своей техники или оставьте стандартный значок.'
              : 'Добавьте фото к своей технике — и его можно будет выбрать для значка. Пока — стандартный значок.'
            : 'Стандартный значок или фото вашей техники.'}
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Подпись на карте{' '}
          <span className="font-normal text-slate-400">
            ({note.length}/{PIN_NOTE_MAX})
          </span>
        </span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, PIN_NOTE_MAX))}
          maxLength={PIN_NOTE_MAX}
          placeholder="Цена, скидки, режим работы"
          className="rounded-md border border-slate-300 px-3 py-2"
        />
        <span className="text-xs text-slate-500">
          Без телефона и e-mail — заказчики пишут через заявку. Например:
        </span>
        <span className="flex flex-wrap gap-2">
          {PIN_NOTE_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setNote(example)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:border-slate-900"
            >
              {example}
            </button>
          ))}
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-md bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
        >
          {saving ? 'Сохраняем…' : 'Сохранить точку'}
        </button>
        <a href="/map" className="text-sm font-semibold text-amber-700 underline">
          Открыть карту
        </a>
      </div>
      {message && (
        <p className={`text-sm ${message.ok ? 'text-emerald-700' : 'text-red-600'}`} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
