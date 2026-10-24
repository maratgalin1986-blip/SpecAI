'use client';

import { useEffect, useState } from 'react';

type Links = { twoGis: string; yandex: string };

/**
 * «Отзывы о площадке»: links to the platform's own 2ГИС and Яндекс Карты cards
 * (api/admin/settings/reviews). They go into the «Бронь завершена» message to
 * the customer; an empty field leaves that card out.
 */
export function ReviewLinksForm() {
  const [loaded, setLoaded] = useState(false);
  const [links, setLinks] = useState<Links>({ twoGis: '', yandex: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void fetch('/api/admin/settings/reviews')
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.reviews) throw new Error(body?.error);
        setLinks({ twoGis: body.reviews.twoGis, yandex: body.reviews.yandex });
        setLoaded(true);
      })
      .catch(() => setMessage({ ok: false, text: 'Не удалось загрузить настройки' }));
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const response = await fetch('/api/admin/settings/reviews', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(links),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setSaving(false);
    if (!response?.ok || !body?.reviews) {
      setMessage({
        ok: false,
        text: typeof body?.error === 'string' ? body.error : 'Не удалось сохранить',
      });
      return;
    }
    setLinks({ twoGis: body.reviews.twoGis, yandex: body.reviews.yandex });
    setMessage({ ok: true, text: 'Сохранено. Ссылки уйдут заказчикам после выполненных заказов.' });
  };

  const field = (kind: keyof Links, label: string, placeholder: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        type="url"
        inputMode="url"
        autoComplete="off"
        value={links[kind]}
        disabled={!loaded}
        maxLength={500}
        onChange={(event) => setLinks((current) => ({ ...current, [kind]: event.target.value }))}
        placeholder={placeholder}
        className="rounded-md border border-slate-300 px-3 py-2"
      />
    </label>
  );

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {field('twoGis', 'Карточка в 2ГИС', 'https://2gis.ru/…/firm/…')}
      {field('yandex', 'Карточка в Яндекс Картах', 'https://yandex.ru/maps/org/…')}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!loaded || saving}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
        {message && (
          <p className={`text-sm ${message.ok ? 'text-emerald-700' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
