'use client';

import { Fragment, useRef, useState } from 'react';
import { CallbackForm } from '@/components/CallbackForm';
import { orderHref, SmetaDisclaimer } from '@/components/SmetaCtas';
import { SmetaUnlock, useUnlocked } from '@/components/SmetaUnlock';
import { SITE } from '@/lib/site';
import { PRICES_NOTE } from '@/lib/smetaPrices';
import {
  snabCsv,
  snabText,
  totalLine,
  UNPRICED,
  visibleSnabRows,
  type SnabList,
  type SnabService,
} from '@/lib/smetaSnab';

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;
const num = (n: number) => n.toLocaleString('ru-RU');

function ServiceCard({ s, tone }: { s: SnabService; tone: 'delivery' | 'machinery' }) {
  return (
    <li
      className={`min-w-0 rounded-2xl p-4 text-sm ${
        tone === 'delivery'
          ? 'border-2 border-amber-400 bg-amber-50'
          : 'border border-dashed border-amber-400 bg-white'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 font-semibold">{s.title}</span>
        <span className="shrink-0 font-extrabold">≈ {rub(s.row.sum)}</span>
      </div>
      <p className="mt-0.5 text-xs text-slate-600">
        {s.row.task}; {s.row.hours} ч × {rub(s.row.rate)}
        {tone === 'machinery' ? ' · можно добавить к заказу' : ''}
      </p>
      <a
        href={orderHref(s.row.machine)}
        className="mt-2 inline-flex min-h-9 items-center rounded-full bg-slate-900 px-3 text-xs font-semibold text-white"
      >
        Заказать у {SITE.name}
      </a>
    </li>
  );
}

// «Материалы от СпецПласт16 с доставкой нашей техникой»: quantities with the
// reserve, СпецПласт16 prices where confirmed, delivery and machinery from
// СпецПласт16 right after the materials they serve, and a one-tap order. No
// links to other websites, no suppliers.
export function SmetaSnabResult({ list, onEdit }: { list: SnabList; onEdit: () => void }) {
  const [unlocked, unlock] = useUnlocked();
  const [copied, setCopied] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const orderBox = useRef<HTMLDivElement>(null);
  const open = unlocked ? list.rows.length : visibleSnabRows(list);
  // What the visitor sees and sends: only the unlocked rows.
  const text = snabText(list, open);
  const pill = 'inline-flex min-h-12 items-center justify-center rounded-full px-6 font-semibold';
  const small = 'inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold';

  const order = () => {
    setOrdering(true);
    setTimeout(() => orderBox.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  function download() {
    const blob = new Blob([snabCsv(list)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'materialy-specplast16.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const orderButtons = (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={order}
        className={`${pill} bg-amber-500 text-slate-950 hover:bg-amber-400`}
      >
        Заказать материалы у {SITE.name}
      </button>
      <a
        href={`${SITE.whatsappHref}?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener"
        className={`${pill} bg-white text-emerald-800 ring-1 ring-emerald-600`}
      >
        Получить предложение в WhatsApp
      </a>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="flex min-w-0 flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <p className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.2em] text-amber-600">
          Смета для снабженца · примерно
        </p>
        <h2 className="text-xl font-bold">Материалы от {SITE.name} с доставкой нашей техникой</h2>
        <p className="text-sm text-slate-600">
          {list.title}. Количество — по вашим размерам, с запасом.
        </p>
        {list.rows.length > 0 && (
          <div className="rounded-xl bg-slate-900 p-3 text-white">
            <p className="text-xs uppercase tracking-wider text-amber-300">Комплект под ключ</p>
            <p className="text-sm">
              {list.materialsTotal > 0 ? 'Материалы, доставка и техника' : 'Доставка и техника'}{' '}
              {SITE.name} одним заказом
            </p>
            <p className="mt-1 text-2xl font-extrabold text-amber-400">
              {list.kitTotal > 0 ? `≈ ${rub(list.kitTotal)}` : UNPRICED}
            </p>
            {list.unpriced > 0 && list.kitTotal > 0 && (
              <p className="mt-1 text-sm font-semibold text-white">
                + материалы, {list.unpriced} поз. — {UNPRICED}
              </p>
            )}
          </div>
        )}
        {orderButtons}
        <button
          type="button"
          onClick={onEdit}
          className="self-start text-sm text-slate-500 underline"
        >
          Изменить параметры
        </button>
      </section>

      {list.rows.length === 0 && (
        <p className="rounded-xl bg-slate-100 p-4 text-sm">
          Для этой работы материалы не нужны — только техника {SITE.name}.
        </p>
      )}

      {list.hints.map((hint) => (
        <p key={hint} className="rounded-xl bg-amber-100 p-3 text-sm font-semibold text-amber-900">
          🚚 {hint}
        </p>
      ))}

      <ol className="flex min-w-0 flex-col gap-3">
        {list.rows.map((r, i) => {
          const locked = i >= open;
          return (
            <Fragment key={r.material}>
              <li className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 font-semibold">{r.name}</span>
                  <span
                    className={`shrink-0 text-lg font-extrabold ${locked ? 'select-none blur-sm' : ''}`}
                    aria-hidden={locked}
                  >
                    {locked ? `00 ${r.unit}` : `${num(r.qty)} ${r.unit}`}
                  </span>
                </div>
                {locked ? (
                  <p className="mt-1 text-xs text-slate-500">
                    🔒 Количество и цена — в полной смете
                  </p>
                ) : (
                  <>
                    <p className="mt-0.5 text-xs text-slate-500">
                      по расчёту {num(r.base)} {r.unit} + запас {r.reserve}%
                    </p>
                    <p className="mt-1 text-sm">
                      {r.price !== null && r.cost !== null ? (
                        <>
                          цена {SITE.name}: {rub(r.price)}/{r.unit} · <b>≈ {rub(r.cost)}</b>
                        </>
                      ) : (
                        <span className="text-slate-700">{UNPRICED}</span>
                      )}
                    </p>
                  </>
                )}
              </li>
              {list.delivery
                .filter((d) => d.after === r.material)
                .map((d) => (
                  <ServiceCard key={d.title} s={d} tone="delivery" />
                ))}
              {list.machinery
                .filter((d) => d.after === r.material)
                .map((d) => (
                  <ServiceCard key={d.title} s={d} tone="machinery" />
                ))}
            </Fragment>
          );
        })}
      </ol>

      {list.rows.length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <p className="font-semibold">{totalLine(list)}</p>
          <p className="text-xs text-slate-500">{PRICES_NOTE}</p>
          {orderButtons}
          {unlocked ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copy} className={`${small} ring-1 ring-slate-300`}>
                {copied ? 'Скопировано ✓' : 'Скопировать список'}
              </button>
              <button type="button" onClick={download} className={`${small} ring-1 ring-slate-300`}>
                Скачать CSV
              </button>
            </div>
          ) : (
            <p className="text-xs text-amber-700">
              🔒 Полный список и CSV для Excel — в полной смете.
            </p>
          )}
        </section>
      )}

      {ordering && (
        <div
          ref={orderBox}
          className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
        >
          <CallbackForm
            source="smeta-snab"
            defaultMessage={text}
            title={`Заказать материалы у ${SITE.name}`}
            subtitle={`${SITE.name} подберёт материалы, привезёт своими самосвалами и манипулятором и подтвердит цену. Отметьте точку объекта на карте.`}
          />
        </div>
      )}

      {!unlocked && list.rows.length > open && (
        <SmetaUnlock
          text={snabText(list)}
          onUnlocked={unlock}
          title="Полная смета со всеми позициями и количеством — откроем сразу здесь"
        />
      )}

      <div className="rounded-2xl bg-slate-900 p-4">
        <SmetaDisclaimer />
      </div>
    </div>
  );
}
