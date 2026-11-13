import type { Metadata } from 'next';
import { categoryBySlug } from '@specai/shared';
import { PriceSurveyForm } from '@/components/PriceSurveyForm';
import { PRICE_SURVEY_LEAD, PRICE_SURVEY_TITLE } from '@/lib/priceReports';
import { SITE } from '@/lib/site';
import { pageMeta } from '@/lib/pageMeta';

export const metadata: Metadata = pageMeta('/ceny/opros', {
  title: 'Опрос: сколько берут за спецтехнику в вашем городе',
  description: `${PRICE_SURVEY_TITLE} ${PRICE_SURVEY_LEAD} Открытый опрос ${SITE.platform}, ответы обезличены.`,
});

/**
 * «Узнай цены в своём городе»: the open survey of the platform, asked as
 * itself. Give one price — get the colleagues' prices back (POST /api/ceny/opros).
 */
export default async function PriceSurveyPage(props: { searchParams: Promise<{ vid?: string }> }) {
  const searchParams = await props.searchParams;
  const defaultCategory = categoryBySlug(searchParams.vid)?.slug;
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6 py-6 text-slate-700">
      <header className="flex flex-col gap-2">
        <p className="cab-eyebrow">Опрос {SITE.platform}</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          {PRICE_SURVEY_TITLE}
        </h1>
        <p>{PRICE_SURVEY_LEAD}</p>
      </header>
      <section className="cab-card">
        <PriceSurveyForm defaultCategory={defaultCategory} />
      </section>
      <p className="text-sm text-slate-500">
        Это открытый опрос площадки: мы не выдаём себя за заказчиков и никому не пишем первыми.
        Средние цены по России и городам —{' '}
        <a href="/ceny" className="font-semibold text-amber-700 underline">
          на странице «Цены на рынке»
        </a>
        .
      </p>
    </article>
  );
}
