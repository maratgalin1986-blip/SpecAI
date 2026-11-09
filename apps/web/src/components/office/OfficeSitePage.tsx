import type { CSSProperties } from 'react';
import type { SitePage } from '@/lib/office/pages';
import { SITE } from '@/lib/site';

// The business card page the «Сайты под ключ» agent makes for a company found
// on the map (R9). It is the client's site, not the platform's: its own light
// look with the niche accent, no catalogue, no platform chrome inside. Server
// component; gets only the built `SitePage`, so no id, token, note or status
// can reach the markup (R19). No external images: the decoration is CSS.

/** Full class names per accent (Tailwind only keeps classes it can read). */
const ACCENT: Record<
  SitePage['accent'],
  { hero: string; button: string; ghost: string; tint: string; text: string; dot: string }
> = {
  teal: {
    hero: 'bg-gradient-to-br from-teal-700 via-teal-800 to-slate-900',
    button: 'bg-teal-700 text-white hover:bg-teal-800 focus-visible:outline-teal-700',
    ghost: 'border-teal-200 bg-white text-teal-900 hover:border-teal-700',
    tint: 'bg-teal-50',
    text: 'text-teal-700',
    dot: 'bg-teal-600',
  },
  amber: {
    hero: 'bg-gradient-to-br from-amber-600 via-amber-700 to-stone-900',
    button: 'bg-amber-700 text-white hover:bg-amber-800 focus-visible:outline-amber-700',
    ghost: 'border-amber-200 bg-white text-amber-900 hover:border-amber-700',
    tint: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-600',
  },
  rose: {
    hero: 'bg-gradient-to-br from-rose-600 via-rose-800 to-slate-900',
    button: 'bg-rose-700 text-white hover:bg-rose-800 focus-visible:outline-rose-700',
    ghost: 'border-rose-200 bg-white text-rose-900 hover:border-rose-700',
    tint: 'bg-rose-50',
    text: 'text-rose-700',
    dot: 'bg-rose-600',
  },
  sky: {
    hero: 'bg-gradient-to-br from-sky-700 via-sky-900 to-slate-950',
    button: 'bg-sky-700 text-white hover:bg-sky-800 focus-visible:outline-sky-700',
    ghost: 'border-sky-200 bg-white text-sky-900 hover:border-sky-700',
    tint: 'bg-sky-50',
    text: 'text-sky-700',
    dot: 'bg-sky-600',
  },
  lime: {
    hero: 'bg-gradient-to-br from-lime-700 via-green-800 to-slate-900',
    button: 'bg-lime-700 text-white hover:bg-lime-800 focus-visible:outline-lime-700',
    ghost: 'border-lime-200 bg-white text-lime-900 hover:border-lime-700',
    tint: 'bg-lime-50',
    text: 'text-lime-700',
    dot: 'bg-lime-600',
  },
  orange: {
    hero: 'bg-gradient-to-br from-orange-600 via-orange-800 to-stone-900',
    button: 'bg-orange-700 text-white hover:bg-orange-800 focus-visible:outline-orange-700',
    ghost: 'border-orange-200 bg-white text-orange-900 hover:border-orange-700',
    tint: 'bg-orange-50',
    text: 'text-orange-700',
    dot: 'bg-orange-600',
  },
};

/** A fine diagonal hatch over the hero: decoration without a picture. */
const HATCH: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0 2px, transparent 2px 14px)',
};

const BUTTON =
  'inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

function PhoneIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"
      />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"
      />
    </svg>
  );
}

export function OfficeSitePage({ page }: { page: SitePage }) {
  const a = ACCENT[page.accent] ?? ACCENT.teal;
  const eyebrow = [page.eyebrow, page.city].filter(Boolean).join(' · ');
  const hasPlace = Boolean(page.address || page.hours || page.mapHref);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Header: the company's name and its niche, no platform menu. */}
      <header className="border-b border-slate-100 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="min-w-0">
            <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${a.text}`}>
              {eyebrow}
            </p>
            <p className="truncate text-lg font-extrabold tracking-tight">{page.title}</p>
          </div>
          <a
            href={page.phoneHref}
            className={`hidden shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition sm:inline-flex ${a.ghost}`}
          >
            <PhoneIcon />
            {page.phone}
          </a>
        </div>
      </header>

      {/* Hero */}
      <section
        className={`relative overflow-hidden px-4 py-12 text-white sm:px-6 sm:py-20 ${a.hero}`}
      >
        <div className="pointer-events-none absolute inset-0" style={HATCH} aria-hidden />
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl"
          aria-hidden
        />
        <div className="relative mx-auto flex max-w-5xl flex-col gap-6">
          <h1 className="max-w-3xl break-words text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            {page.hero}
          </h1>
          {page.address && (
            <p className="max-w-2xl text-base text-white/85 sm:text-lg">{page.address}</p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href={page.phoneHref}
              className={`${BUTTON} bg-white text-slate-900 hover:bg-slate-100 focus-visible:outline-white sm:flex-none sm:px-7`}
            >
              <PhoneIcon />
              Позвонить
            </a>
            <a
              href={page.whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`${BUTTON} border border-white/40 bg-white/10 text-white hover:bg-white/20 focus-visible:outline-white sm:flex-none sm:px-7`}
            >
              <ChatIcon />
              Написать в WhatsApp
            </a>
          </div>
          <p className="text-sm text-white/75">{page.phone}</p>
        </div>
      </section>

      {/* Services */}
      <section className="px-4 py-10 sm:px-6 sm:py-14" aria-labelledby="services">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${a.text}`}>Услуги</p>
            <h2 id="services" className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Чем мы занимаемся
            </h2>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {page.services.map((service) => (
              <li
                key={service}
                className={`flex items-start gap-3 rounded-2xl border border-slate-100 p-4 ${a.tint}`}
              >
                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${a.dot}`} aria-hidden />
                <span className="text-base font-semibold leading-snug">{service}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-slate-600">
            Уточнить детали и записаться можно по телефону или в WhatsApp.
          </p>
        </div>
      </section>

      {/* Where to find us */}
      {hasPlace && (
        <section
          className="border-t border-slate-100 px-4 py-10 sm:px-6 sm:py-14"
          aria-labelledby="place"
        >
          <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-[1fr_auto] sm:items-start">
            <div className="flex flex-col gap-4">
              <div>
                <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${a.text}`}>
                  Контакты
                </p>
                <h2 id="place" className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
                  Как нас найти
                </h2>
              </div>
              <dl className="grid gap-4 text-base sm:grid-cols-2">
                {page.address && (
                  <div>
                    <dt className="text-sm text-slate-500">Адрес</dt>
                    <dd className="font-semibold">{page.address}</dd>
                  </div>
                )}
                {page.hours && (
                  <div>
                    <dt className="text-sm text-slate-500">Часы работы</dt>
                    <dd className="font-semibold">{page.hours}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm text-slate-500">Телефон</dt>
                  <dd className="font-semibold">
                    <a href={page.phoneHref} className="hover:underline">
                      {page.phone}
                    </a>
                  </dd>
                </div>
              </dl>
            </div>
            {page.mapHref && (
              <a
                href={page.mapHref}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex min-h-[48px] items-center justify-center rounded-2xl border px-5 py-3 text-base font-semibold transition ${a.ghost}`}
              >
                Открыть на карте
              </a>
            )}
          </div>
        </section>
      )}

      {/* Footer line; the spacer keeps it above the sticky bar on phones. */}
      <footer className="border-t border-slate-100 px-4 py-6 pb-28 text-center text-xs text-slate-500 sm:px-6 sm:pb-6">
        <p>
          {page.title}
          {page.city ? ` · ${page.city}` : ''}
        </p>
        <p className="mt-1">
          Сайт сделан{' '}
          <a href="/" className="font-semibold text-slate-700 hover:underline">
            {SITE.platform} от {SITE.name}
          </a>
        </p>
      </footer>

      {/* Sticky call bar on phones */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:hidden">
        <div className="flex gap-3">
          <a href={page.phoneHref} className={`${BUTTON} ${a.button}`}>
            <PhoneIcon />
            Позвонить
          </a>
          <a
            href={page.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BUTTON} border ${a.ghost}`}
          >
            <ChatIcon />
            WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
