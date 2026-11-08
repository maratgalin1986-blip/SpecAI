import type { Metadata } from 'next';
import { categoryName } from '@specai/shared';
import {
  cellText,
  indexCategories,
  INDEX_MIN_REPORTERS,
  INDEX_RANGE_MIN_REPORTERS,
  placesWithData,
  type PriceCell,
} from '@/lib/priceIndex';
import { loadPriceIndex } from '@/lib/priceIndexData';
import { PRICE_SURVEY_PATH, PRICE_SURVEY_TITLE } from '@/lib/priceReports';
import { SITE } from '@/lib/site';

// As the city pages: a page built while the database was unreachable does not stay long.
export const revalidate = 600;

const TITLE = 'Цены на аренду спецтехники с машинистом — по данным исполнителей ИИСтройка24';

export const metadata: Metadata = {
  title: TITLE,
  description:
    'Сколько стоит час спецтехники с машинистом: медиана и разброс цен по России, регионам и городам — по ценам исполнителей площадки и ответам на открытый опрос. Без имён компаний.',
  alternates: { canonical: '/ceny' },
};

function Cell({ cell }: { cell: PriceCell | undefined }) {
  if (!cell) return <span className="text-slate-400">мало данных</span>;
  return (
    <span>
      <span className="font-semibold text-slate-900">{cellText(cell)}</span>{' '}
      <span className="text-xs text-slate-500">· {cell.reporters} исп.</span>
    </span>
  );
}

/**
 * «Цены на рынке»: an anonymous index from the live data (lib/priceIndex.ts):
 * other providers' machines on the platform and the survey answers, never
 * СпецПласт16's own fleet; a number only with ≥ 3 different companies or
 * participants behind it.
 */
export default async function PricesPage() {
  const { index, points, updatedAt, loaded } = await loadPriceIndex();
  const categories = indexCategories(index);
  const regions = placesWithData(index.regions, points, 'region');
  const cities = placesWithData(index.cities, points, 'city');
  const updated = updatedAt.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <article className="mx-auto flex max-w-4xl flex-col gap-8 py-6 text-slate-700">
      <header className="flex flex-col gap-3">
        <p className="cab-eyebrow">Цены на рынке</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          {TITLE}
        </h1>
        <p>
          Сколько обычно берут за час работы техники с машинистом. Числа — из цен, которые
          исполнители {SITE.platform} сами указали в карточках своей техники, и из ответов на
          открытый опрос. Обновлено {updated} (МСК).
        </p>
        <p className="text-sm">
          Вы исполнитель? {PRICE_SURVEY_TITLE}{' '}
          <a href={PRICE_SURVEY_PATH} className="font-semibold text-amber-700 underline">
            Ответьте на 3 вопроса
          </a>{' '}
          — сразу покажем цены коллег.
        </p>
      </header>

      {!loaded && (
        <p className="cab-card text-sm">
          Данные сейчас не загрузились — зайдите чуть позже. Чисел наугад мы не показываем.
        </p>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="russia">
        <h2 id="russia" className="text-xl font-bold text-slate-900">
          По России
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Вид техники</th>
                <th className="px-4 py-2 font-medium">Медиана за час (разброс)</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.slug} className="border-t border-slate-100">
                  <td className="px-4 py-2">{category.name}</td>
                  <td className="px-4 py-2">
                    <Cell cell={index.russia.get(category.slug)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {[
        { id: 'regions', title: 'По регионам', places: regions },
        { id: 'cities', title: 'По городам', places: cities },
      ].map(
        (level) =>
          level.places.length > 0 && (
            <section key={level.id} className="flex flex-col gap-3" aria-labelledby={level.id}>
              <h2 id={level.id} className="text-xl font-bold text-slate-900">
                {level.title}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {level.places.map((place) => (
                  <li key={place.place} className="cab-card flex flex-col gap-2">
                    <p className="font-semibold text-slate-900">{place.place}</p>
                    <ul className="flex flex-col gap-1 text-sm">
                      {place.cells.map(({ slug, cell }) => (
                        <li key={slug} className="flex flex-wrap justify-between gap-x-3">
                          <span>{categoryName(slug)}</span>
                          <Cell cell={cell} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}

      <section className="flex flex-col gap-2 text-sm" aria-labelledby="how">
        <h2 id="how" className="text-lg font-bold text-slate-900">
          Откуда цифры
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Цены за час с машинистом, которые компании-исполнители сами указали в карточках своей
            техники на площадке (если указана только смена — смена, делённая на 8 часов), и ответы
            на открытый опрос «{PRICE_SURVEY_TITLE}». Ответы старше полугода не учитываются.
          </li>
          <li>
            Каждая компания или участник опроса считается один раз: сначала берём середину её цен,
            потом медиану по всем. Медиана — середина: половина берёт меньше, половина больше. В
            скобках — от самой низкой до самой высокой цены, когда за числом не меньше{' '}
            {INDEX_RANGE_MIN_REPORTERS} участников (при меньшем числе разброс выдал бы отдельные
            цены).
          </li>
          <li>
            Число показываем, только если за ним не меньше {INDEX_MIN_REPORTERS} разных компаний или
            участников опроса; иначе — «мало данных». Названий компаний, отдельных цен и машин здесь
            нет, пропуски мы не заполняем придуманными числами.
          </li>
          <li>
            Парк {SITE.name} в расчёт не входит: его цены — в прайсе на страницах аренды. Цену
            каждой машины назначает её владелец.
          </li>
        </ul>
      </section>
    </article>
  );
}
