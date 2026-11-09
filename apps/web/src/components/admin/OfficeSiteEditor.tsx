'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { chipClass } from '@/components/admin/AdminUi';
import type { SITE_CONTENT_LIMITS } from '@/lib/office/siteContent';
import {
  ACCENT_TITLES,
  EDITOR_DOMAIN_MAX,
  EDITOR_PHONE_MAX,
  SITE_PHOTO_TYPES,
  addPhoto,
  addService,
  draftToContent,
  editorSnapshot,
  removeAt,
  sitePhotoProblem,
  type SiteAccent,
  type SiteEditorDefaults,
  type SiteEditorDraft,
} from '@/lib/office/siteEditor';

// Редактор клиентского сайта на /admin/office/<id> (S5) и поле «Свой домен» (S7): тексты,
// услуги, часы, контакты, цвет, фото и форма заявки. Пустое поле — как в карточке компании.
// Фото загружаются сразу (POST /api/admin/office/upload), на сайт попадают после «Сохранить»
// (PUT /api/admin/office/prospects/<id>/site).

/** Кружок цвета (полные имена классов — Tailwind оставляет только те, что видит в коде). */
const SWATCH: Record<SiteAccent, string> = {
  teal: 'bg-teal-600',
  amber: 'bg-amber-600',
  rose: 'bg-rose-600',
  sky: 'bg-sky-600',
  lime: 'bg-lime-600',
  orange: 'bg-orange-600',
};

const INPUT =
  'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal text-graphite-900';
const SMALL_BUTTON =
  'rounded-md border border-graphite-200 bg-white px-2 py-1 text-xs font-semibold text-graphite-700 hover:border-graphite-800 disabled:opacity-40';

type Message = { ok: boolean; text: string } | null;

export interface OfficeSiteEditorProps {
  id: string;
  /** Адрес сайта: папка фото в хранилище. */
  slug: string;
  /** Правка из базы как поля формы (editorDraft). */
  initial: SiteEditorDraft;
  /** Свой домен как его читает человек ('' — не подключён). */
  domain: string;
  /** Что показывает сайт без правок — подсказки в пустых полях. */
  defaults: SiteEditorDefaults;
  nicheTitle: string;
  accents: readonly SiteAccent[];
  limits: typeof SITE_CONTENT_LIMITS;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-graphite-700">
      {label}
      {children}
      {hint && <span className="font-normal text-graphite-500">{hint}</span>}
    </label>
  );
}

function asCard(value: string, empty: string): string {
  return value ? `Пусто — как в карточке: ${value}` : empty;
}

export function OfficeSiteEditor({
  id,
  slug,
  initial,
  domain: initialDomain,
  defaults,
  nicheTitle,
  accents,
  limits,
}: OfficeSiteEditorProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<SiteEditorDraft>(initial);
  const [domain, setDomain] = useState(initialDomain);
  const [saved, setSaved] = useState(() => editorSnapshot(initial, initialDomain));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [photoMessage, setPhotoMessage] = useState<Message>(null);

  const dirty = editorSnapshot(draft, domain) !== saved;

  // Загруженные, но не сохранённые фото и правки не теряются молча при уходе со страницы.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function set<K extends keyof SiteEditorDraft>(key: K, value: SiteEditorDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }

  function setService(index: number, value: string) {
    setDraft((current) => ({
      ...current,
      services: current.services.map((s, i) => (i === index ? value : s)),
    }));
    setMessage(null);
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0 || uploading) return;
    setUploading(true);
    setPhotoMessage(null);
    let count = draft.photos.length;
    let added = 0;
    const errors: string[] = [];
    for (const file of files) {
      if (count >= limits.photos) {
        errors.push(`Не больше ${limits.photos} фото — удалите лишние, чтобы добавить новые`);
        break;
      }
      const problem = sitePhotoProblem(file);
      if (problem) {
        errors.push(`${file.name}: ${problem.error}`);
        continue;
      }
      const body = new FormData();
      body.append('file', file);
      body.append('slug', slug);
      const response = await fetch('/api/admin/office/upload', { method: 'POST', body }).catch(
        () => null,
      );
      const data = (await response?.json().catch(() => null)) as {
        url?: unknown;
        error?: unknown;
      } | null;
      if (!response?.ok || typeof data?.url !== 'string') {
        const reason =
          typeof data?.error === 'string'
            ? data.error
            : response
              ? 'не загрузилось — попробуйте ещё раз'
              : 'нет связи — попробуйте ещё раз';
        errors.push(`${file.name}: ${reason}`);
        continue;
      }
      const url = data.url;
      count += 1;
      added += 1;
      setDraft((current) => ({ ...current, photos: addPhoto(current.photos, url, limits.photos) }));
    }
    setUploading(false);
    if (errors.length) {
      setPhotoMessage({ ok: false, text: errors.join('\n') });
    } else if (added) {
      setPhotoMessage({
        ok: true,
        text: 'Фото загружены — нажмите «Сохранить», чтобы они появились на сайте',
      });
    }
  }

  async function save() {
    if (saving || uploading || !dirty) return;
    setSaving(true);
    setMessage(null);
    const snapshot = editorSnapshot(draft, domain);
    const response = await fetch(`/api/admin/office/prospects/${encodeURIComponent(id)}/site`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: draftToContent(draft), domain: domain.trim() }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
    } | null;
    setSaving(false);
    if (!response?.ok || !data?.ok) {
      setMessage({
        ok: false,
        text:
          typeof data?.error === 'string'
            ? data.error
            : response
              ? 'Не сохранилось — попробуйте ещё раз'
              : 'Нет связи — правки не сохранились, попробуйте ещё раз',
      });
      return;
    }
    setSaved(snapshot);
    setPhotoMessage(null);
    setMessage({ ok: true, text: 'Сохранено — сайт и превью уже показывают правки' });
    router.refresh();
  }

  function reset() {
    setDraft(initial);
    setDomain(initialDomain);
    setSaved(editorSnapshot(initial, initialDomain));
    setMessage(null);
    setPhotoMessage(null);
  }

  const photosFull = draft.photos.length >= limits.photos;

  return (
    <form
      className="flex flex-col gap-5 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <section className="flex flex-col gap-3">
        <h3 className="font-bold text-graphite-950">Тексты</h3>
        <Field label="Название" hint={asCard(defaults.title, 'Пусто — как в карточке')}>
          <input
            value={draft.title}
            maxLength={limits.title}
            placeholder={defaults.title}
            onChange={(event) => set('title', event.target.value)}
            className={INPUT}
          />
        </Field>
        <Field label="Главная строка" hint={asCard(defaults.hero, 'Пусто — строка ниши')}>
          <input
            value={draft.hero}
            maxLength={limits.hero}
            placeholder={defaults.hero}
            onChange={(event) => set('hero', event.target.value)}
            className={INPUT}
          />
        </Field>
        <Field
          label="О компании"
          hint={`Только то, что рассказала сама компания: без выдуманных цифр и отзывов. ${draft.about.length} из ${limits.about}. Пусто — блока нет.`}
        >
          <textarea
            value={draft.about}
            maxLength={limits.about}
            rows={5}
            placeholder="С какого года работаете, чем отличаетесь, как записаться"
            onChange={(event) => set('about', event.target.value)}
            className={INPUT}
          />
        </Field>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-bold text-graphite-950">Услуги</h3>
        {draft.services.length === 0 ? (
          <div className="flex flex-col gap-2 rounded-md bg-graphite-50 p-3">
            <p className="text-xs text-graphite-600">Как в карточке ({nicheTitle}):</p>
            {defaults.services.length ? (
              <ul className="list-disc pl-5 text-graphite-800">
                {defaults.services.map((service) => (
                  <li key={service}>{service}</li>
                ))}
              </ul>
            ) : (
              <p className="text-graphite-600">Список пуст.</p>
            )}
            <div>
              <button
                type="button"
                className={SMALL_BUTTON}
                onClick={() =>
                  set(
                    'services',
                    defaults.services.length ? defaults.services.slice(0, limits.services) : [''],
                  )
                }
              >
                Изменить список
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {draft.services.map((service, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={service}
                  maxLength={limits.service}
                  aria-label={`Услуга ${index + 1}`}
                  placeholder="Название услуги"
                  onChange={(event) => setService(index, event.target.value)}
                  className={INPUT}
                />
                <button
                  type="button"
                  className={SMALL_BUTTON}
                  onClick={() => set('services', removeAt(draft.services, index))}
                >
                  Удалить
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={SMALL_BUTTON}
                disabled={draft.services.length >= limits.services}
                onClick={() => set('services', addService(draft.services, limits.services))}
              >
                + Добавить услугу
              </button>
              <button type="button" className={SMALL_BUTTON} onClick={() => set('services', [])}>
                Вернуть как в карточке
              </button>
              <span className="self-center text-xs text-graphite-500">
                {draft.services.length} из {limits.services}
              </span>
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <h3 className="font-bold text-graphite-950 sm:col-span-2">Контакты и часы</h3>
        <Field label="Часы работы" hint={asCard(defaults.hours, 'Пусто — часы не показываются')}>
          <input
            value={draft.hours}
            maxLength={limits.hours}
            placeholder={defaults.hours || 'Пн–Пт 9:00–18:00'}
            onChange={(event) => set('hours', event.target.value)}
            className={INPUT}
          />
        </Field>
        <Field label="Адрес" hint={asCard(defaults.address, 'Пусто — адрес не показывается')}>
          <input
            value={draft.address}
            maxLength={limits.address}
            placeholder={defaults.address}
            onChange={(event) => set('address', event.target.value)}
            className={INPUT}
          />
        </Field>
        <Field label="Телефон" hint={asCard(defaults.phone, 'Пусто — как в карточке')}>
          <input
            value={draft.phone}
            maxLength={EDITOR_PHONE_MAX}
            inputMode="tel"
            placeholder={defaults.phone}
            onChange={(event) => set('phone', event.target.value)}
            className={INPUT}
          />
        </Field>
        <Field
          label="WhatsApp"
          hint="Пусто — как в карточке; нет WhatsApp в карточке — кнопок WhatsApp на сайте не будет"
        >
          <input
            value={draft.whatsapp}
            maxLength={EDITOR_PHONE_MAX}
            inputMode="tel"
            placeholder={draft.phone.trim() || defaults.phone}
            onChange={(event) => set('whatsapp', event.target.value)}
            className={INPUT}
          />
        </Field>
      </section>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-bold text-graphite-950">Цвет сайта</legend>
        <div className="flex flex-wrap gap-2">
          <label className={`${chipClass(draft.accent === '')} cursor-pointer focus-within:ring-2`}>
            <input
              type="radio"
              name="accent"
              className="sr-only"
              checked={draft.accent === ''}
              onChange={() => set('accent', '')}
            />
            <span className={`h-3 w-3 rounded-full ${SWATCH[defaults.accent]}`} aria-hidden />
            Как у ниши
          </label>
          {accents.map((accent) => (
            <label
              key={accent}
              className={`${chipClass(draft.accent === accent)} cursor-pointer focus-within:ring-2`}
            >
              <input
                type="radio"
                name="accent"
                className="sr-only"
                checked={draft.accent === accent}
                onChange={() => set('accent', accent)}
              />
              <span className={`h-3 w-3 rounded-full ${SWATCH[accent]}`} aria-hidden />
              {ACCENT_TITLES[accent]}
            </label>
          ))}
        </div>
      </fieldset>

      <section className="flex flex-col gap-2">
        <h3 className="font-bold text-graphite-950">
          Фото{' '}
          <span className="font-mono text-xs font-normal text-graphite-500">
            {draft.photos.length} из {limits.photos}
          </span>
        </h3>
        <p className="text-xs text-graphite-600">
          Только фото, которые прислала компания (её помещение, работы, команда). JPEG, PNG или WebP
          до 5 МБ.
        </p>
        {draft.photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {draft.photos.map((src, index) => (
              <figure key={src} className="flex flex-col gap-1">
                {/* Свои фото из хранилища площадки: обычный img, без оптимизатора картинок. */}
                <img
                  src={src}
                  alt={`Фото ${index + 1}`}
                  loading="lazy"
                  className="aspect-square w-full rounded-md border border-graphite-100 object-cover"
                />
                <button
                  type="button"
                  className={SMALL_BUTTON}
                  onClick={() => set('photos', removeAt(draft.photos, index))}
                >
                  Удалить
                </button>
              </figure>
            ))}
          </div>
        )}
        <label className="flex flex-col gap-1 text-xs font-semibold text-graphite-700">
          {uploading
            ? 'Загружаю…'
            : photosFull
              ? `Уже ${limits.photos} фото — больше не добавить`
              : 'Добавить фото'}
          <input
            type="file"
            accept={SITE_PHOTO_TYPES.join(',')}
            multiple
            disabled={uploading || photosFull}
            onChange={(event) => void upload(event)}
            className="text-xs font-normal disabled:opacity-40"
          />
        </label>
        {photoMessage && (
          <p
            className={`whitespace-pre-line text-xs ${
              photoMessage.ok ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {photoMessage.text}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <h3 className="font-bold text-graphite-950">Форма заявки</h3>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={draft.leadForm}
            onChange={(event) => set('leadForm', event.target.checked)}
            className="mt-0.5"
          />
          <span>
            Форма заявки — только после принятия клиентом оферты и согласия на поручение
            <span className="block text-xs text-graphite-500">
              По умолчанию выключена. Включайте, когда клиент принял оферту с поручением на
              обработку заявок: тогда на сайте появятся форма и политика компании (/s/{slug}
              /politika). Заявки уходят на почту компании и видны ниже на этой странице.
            </span>
          </span>
        </label>
      </section>

      <section className="flex flex-col gap-1">
        <h3 className="font-bold text-graphite-950">Подвал</h3>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={draft.hideCredit}
            onChange={(event) => set('hideCredit', event.target.checked)}
            className="mt-0.5"
          />
          <span>
            Убрать кнопку «Хотите такой же сайт?» из подвала
            <span className="block text-xs text-graphite-500">
              Строка «Сайт сделан …» остаётся.
            </span>
          </span>
        </label>
      </section>

      <section className="flex flex-col gap-1">
        <Field
          label="Свой домен"
          hint={
            <>
              Пусто — сайт только по адресу /s/{slug}. Как подключить: у регистратора домена —
              запись A @ → 76.76.21.21 и CNAME www → cname.vercel-dns.com; затем добавьте домен (с
              www и без) в Vercel → Domains. До этого сайт по домену не откроется.
            </>
          }
        >
          <input
            value={domain}
            maxLength={EDITOR_DOMAIN_MAX}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ulybka-kazan.ru"
            onChange={(event) => {
              setDomain(event.target.value);
              setMessage(null);
            }}
            className={`${INPUT} font-mono`}
          />
        </Field>
      </section>

      <div className="flex flex-wrap items-center gap-2 border-t border-graphite-100 pt-3">
        <button
          type="submit"
          disabled={saving || uploading || !dirty}
          className="cab-action disabled:opacity-40"
        >
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
        {dirty && !saving && (
          <button type="button" className={SMALL_BUTTON} onClick={reset}>
            Отменить изменения
          </button>
        )}
        {dirty && !message && (
          <span className="text-xs text-amber-800">Есть несохранённые правки</span>
        )}
        {message && (
          <span className={`text-xs ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
