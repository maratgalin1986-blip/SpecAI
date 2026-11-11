import type { Metadata } from 'next';
import { LANDING_PATH } from '@/lib/office/landing';
import { OFERTA_EDITION, OFERTA_PATH, ofertaSections } from '@/lib/office/oferta';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';

// Публичная оферта услуги «Сайт под ключ» (К9). На неё ссылаются счёт /oplata/<token>
// («оплата счёта — согласие с офертой») и страница услуги. Текст — lib/office/oferta.ts;
// страница статическая, в базу не ходит (ставку НДС называет счёт, не оферта).

const TITLE = 'Оферта: сайт для компании под ключ';

export const metadata: Metadata = {
  title: TITLE,
  description: `Публичная оферта ${SITE.legalName}: создание сайта компании и поддержка его работы. Условия оплаты, возврата и обработки заявок.`,
  alternates: { canonical: OFERTA_PATH },
};

export default function OfertaPage() {
  const root = siteUrl().replace(/\/+$/, '');
  const sections = ofertaSections({ serviceUrl: `${root}${LANDING_PATH}` });

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-8 text-slate-700">
      <header className="flex flex-col gap-2">
        <p className="eyebrow text-amber-700">
          {SITE.platform} от {SITE.name} · Сайты под ключ
        </p>
        <h1 className="text-2xl font-extrabold leading-tight tracking-[-0.02em] text-slate-900 sm:text-4xl">
          Публичная оферта на создание сайта и поддержку его работы
        </h1>
        <p className="text-sm text-slate-600">Редакция от {OFERTA_EDITION}</p>
      </header>

      {sections.map((section, index) => (
        <section key={section.title} className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-slate-900">
            {index + 1}. {section.title}
          </h2>
          <ol className="flex flex-col gap-2 text-sm leading-relaxed">
            {section.items.map((item, itemIndex) => (
              <li key={item} className="flex gap-2">
                <span className="shrink-0 font-semibold tabular-nums text-slate-500">
                  {index + 1}.{itemIndex + 1}.
                </span>
                <span className="break-words">{item}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}

      <footer className="text-sm text-slate-600">
        <a href={LANDING_PATH} className="font-semibold text-amber-700 hover:underline">
          Вернуться к описанию услуги
        </a>
      </footer>
    </article>
  );
}
