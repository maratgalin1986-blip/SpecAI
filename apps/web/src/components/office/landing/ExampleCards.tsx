import type { LandingExample } from '@/lib/office/landing';

// Карточки примеров (S3): ниши агента «Сайты» → /sajt-pod-klyuch/primer/<ниша>. Каждая —
// миниатюра шаблона в цвете ниши, без картинок: шапка, кнопки, первые услуги.

/** Полные имена классов по цвету ниши (Tailwind оставляет только те, что видит в коде). */
const ACCENT: Record<LandingExample['accent'], { hero: string; dot: string; ring: string }> = {
  teal: { hero: 'from-teal-700 to-slate-900', dot: 'bg-teal-600', ring: 'hover:border-teal-500' },
  amber: {
    hero: 'from-amber-600 to-stone-900',
    dot: 'bg-amber-600',
    ring: 'hover:border-amber-500',
  },
  rose: { hero: 'from-rose-600 to-slate-900', dot: 'bg-rose-600', ring: 'hover:border-rose-500' },
  sky: { hero: 'from-sky-700 to-slate-950', dot: 'bg-sky-600', ring: 'hover:border-sky-500' },
  lime: { hero: 'from-lime-700 to-slate-900', dot: 'bg-lime-600', ring: 'hover:border-lime-500' },
  orange: {
    hero: 'from-orange-600 to-stone-900',
    dot: 'bg-orange-600',
    ring: 'hover:border-orange-500',
  },
};

export function ExampleCards({ examples }: { examples: LandingExample[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {examples.map((example) => {
        const a = ACCENT[example.accent] ?? ACCENT.teal;
        return (
          <li key={example.key}>
            <a
              href={example.href}
              className={`group flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white transition ${a.ring} hover:shadow-lg`}
            >
              <div
                className={`flex flex-col gap-3 bg-gradient-to-br px-5 py-6 text-white ${a.hero}`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
                  {example.title}
                </p>
                <p className="text-xl font-extrabold leading-tight tracking-tight">
                  {example.name}
                </p>
                <div className="flex gap-2" aria-hidden>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-900">
                    Позвонить
                  </span>
                  <span className="rounded-full border border-white/40 px-3 py-1 text-xs font-semibold">
                    WhatsApp
                  </span>
                </div>
              </div>
              <ul className="flex flex-1 flex-col gap-2 px-5 py-4 text-sm text-slate-700">
                {example.services.map((service) => (
                  <li key={service} className="flex items-start gap-2">
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${a.dot}`}
                      aria-hidden
                    />
                    {service}
                  </li>
                ))}
              </ul>
              <span className="border-t border-slate-100 px-5 py-3 text-sm font-bold text-slate-900 group-hover:underline">
                Посмотреть пример →
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
