import { LANDINGS } from '@/lib/landings';
import { SITE } from '@/lib/site';

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-900 text-slate-300">
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-10 pb-36 text-sm sm:grid-cols-3">
        <div>
          <div className="text-base font-semibold text-white">
            {SITE.platform} <span className="text-amber-400">от {SITE.name}</span>
          </div>
          <p className="mt-2">{SITE.tagline}.</p>
        </div>
        <div className="flex flex-col gap-1">
          <div className="font-semibold text-white">Разделы</div>
          <a href="/equipment" className="hover:text-white">
            Каталог техники
          </a>
          <a href="/map" className="hover:text-white">
            Карта исполнителей
          </a>
          {LANDINGS.map((landing) => (
            <a key={landing.slug} href={`/arenda/${landing.slug}`} className="hover:text-white">
              Аренда {landing.title}
            </a>
          ))}
          <a href="/orders" className="hover:text-white">
            Заявка на технику
          </a>
          <a href="/agents" className="hover:text-white">
            ИИ-агенты
          </a>
          <a href="/contacts" className="hover:text-white">
            Контакты
          </a>
          <a href="/privacy" className="hover:text-white">
            Политика конфиденциальности
          </a>
          <a href="/support" className="font-semibold text-amber-400 hover:text-white">
            ♥ Поддержать проект
          </a>
          <a href="/credits" className="hover:text-white">
            Авторы фото и видео
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
          <a href="/qr" className="mt-3 hidden items-center gap-3 hover:text-white sm:flex">
            <img
              src="/qr/code.svg"
              alt=""
              width={64}
              height={64}
              loading="lazy"
              className="rounded bg-white p-1"
            />
            <span>
              QR-код сайта
              <br />
              <span className="text-xs text-slate-400">для визиток и техники</span>
            </span>
          </a>
        </div>
      </div>
      <div className="border-t border-slate-800 py-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} {SITE.legalName || SITE.name}
        {SITE.inn ? ` · ИНН ${SITE.inn}` : ''}
      </div>
    </footer>
  );
}
