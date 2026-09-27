import { LANDINGS } from '@/lib/landings';
import { SITE } from '@/lib/site';

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-900 text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-10 pb-28 text-sm sm:grid-cols-3">
        <div>
          <div className="text-base font-semibold text-white">{SITE.name}</div>
          <p className="mt-2">{SITE.tagline}.</p>
        </div>
        <div className="flex flex-col gap-1">
          <div className="font-semibold text-white">Разделы</div>
          <a href="/equipment" className="hover:text-white">
            Каталог техники
          </a>
          {LANDINGS.map((landing) => (
            <a key={landing.slug} href={`/arenda/${landing.slug}`} className="hover:text-white">
              Аренда {landing.title}
            </a>
          ))}
          <a href="/orders" className="hover:text-white">
            Заявки
          </a>
          <a href="/agents" className="hover:text-white">
            ИИ-агенты
          </a>
          <a href="/register" className="hover:text-white">
            Стать поставщиком
          </a>
          <a href="/contacts" className="hover:text-white">
            Контакты
          </a>
          <a href="/privacy" className="hover:text-white">
            Политика конфиденциальности
          </a>
        </div>
        <div className="flex flex-col gap-1">
          <div className="font-semibold text-white">Контакты</div>
          <a href={SITE.phoneHref} className="hover:text-white">
            {SITE.phone}
          </a>
          <a href={`mailto:${SITE.email}`} className="hover:text-white">
            {SITE.email}
          </a>
          <span>
            {SITE.city}, {SITE.region}
          </span>
          <span>{SITE.workingHours}</span>
        </div>
      </div>
      <div className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {SITE.legalName || SITE.name}
        {SITE.inn ? ` · ИНН ${SITE.inn}` : ''}
      </div>
    </footer>
  );
}
