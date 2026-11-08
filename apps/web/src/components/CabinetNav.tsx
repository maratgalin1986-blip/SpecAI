import type { ReactNode } from 'react';

export interface CabinetNavItem {
  href: string;
  label: string;
  /** Число или короткая пометка справа («3», «!»). */
  badge?: string | number | null;
}

/**
 * Меню кабинета: слева на широком экране (липкое), строкой с прокруткой на
 * телефоне. Пункты — якоря разделов той же страницы, без отдельных страниц.
 */
export function CabinetLayout({
  title,
  items,
  children,
}: {
  title: string;
  items: CabinetNavItem[];
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8">
      <nav
        aria-label={title}
        className="-mx-4 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:overflow-visible lg:px-0"
      >
        <p className="cab-eyebrow mb-2 hidden lg:block">{title}</p>
        <ul className="flex gap-2 lg:flex-col lg:gap-1">
          {items.map((item) => (
            <li key={item.href} className="shrink-0">
              <a
                href={item.href}
                className="flex min-h-11 items-center justify-between gap-2 whitespace-nowrap rounded-full border border-graphite-200 bg-white px-3 text-sm font-semibold text-graphite-800 hover:border-signal-400 lg:rounded-lg lg:border-transparent lg:bg-transparent lg:hover:bg-graphite-100"
              >
                {item.label}
                {item.badge !== undefined && item.badge !== null && item.badge !== 0 && (
                  <span className="rounded-full bg-signal-100 px-2 text-xs font-bold text-signal-800">
                    {item.badge}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
    </div>
  );
}

/** Блок «Ваш менеджер»: кто на связи у площадки, без личных данных людей. */
export function ManagerCard({
  phone,
  phoneHref,
  telegram,
}: {
  phone: string;
  phoneHref: string;
  telegram?: string | null;
}) {
  return (
    <section id="manager" className="cab-card flex scroll-mt-24 flex-col gap-1">
      <h2 className="text-lg font-semibold">Связь с площадкой</h2>
      <p className="text-sm text-graphite-600">
        Вопросы по заказу, документам и проверке — менеджер ответит в рабочее время.
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        <a href={phoneHref} className="cab-action">
          {phone}
        </a>
        {telegram && (
          <a href={telegram} className="cab-action" target="_blank" rel="noreferrer">
            Написать в Телеграм
          </a>
        )}
      </div>
    </section>
  );
}
