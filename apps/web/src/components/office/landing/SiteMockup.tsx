import type { LandingExample } from '@/lib/office/landing';

// Миниатюра клиентского сайта в рамке браузера для первого экрана страницы услуги.
// Чистая разметка без картинок; украшение — скрыто от экранных чтецов.

export function SiteMockup({ example, city }: { example: LandingExample; city: string }) {
  return (
    <div
      aria-hidden
      className="w-full overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl shadow-black/40 ring-1 ring-white/10"
    >
      <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-2 flex-1 truncate rounded-md bg-white px-2 py-0.5 text-[11px] text-slate-500">
          ваша-компания.рф
        </span>
      </div>
      <div className="bg-gradient-to-br from-teal-700 via-teal-800 to-slate-900 px-4 py-5 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
          {example.title} · {city}
        </p>
        <p className="mt-1 text-xl font-extrabold tracking-tight">{example.name}</p>
        <div className="mt-3 flex gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-900">
            Позвонить
          </span>
          <span className="rounded-full border border-white/40 bg-white/10 px-3 py-1 text-[11px] font-semibold">
            Написать в WhatsApp
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
        {example.services.map((service) => (
          <span
            key={service}
            className="flex items-center gap-2 rounded-xl bg-teal-50 px-3 py-2 text-[12px] font-semibold"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" />
            {service}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-2 border-t border-slate-100 p-3">
        <p className="text-[12px] font-bold">Оставить заявку</p>
        <div className="flex gap-2">
          <span className="h-7 flex-1 rounded-lg border border-slate-200" />
          <span className="h-7 flex-1 rounded-lg border border-slate-200" />
          <span className="flex h-7 items-center rounded-lg bg-teal-700 px-3 text-[11px] font-bold text-white">
            Отправить
          </span>
        </div>
      </div>
    </div>
  );
}
