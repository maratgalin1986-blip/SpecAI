import type { DesignProject } from '@/lib/design';
import { ZONE_FILL } from '@/components/design/LandscapePlanSvg';

// The text sheets of a design project: the style board (palette, finishes,
// lighting, furniture zoning) and the «ведомость» (rooms, finishing areas,
// openings, materials) or, for a plot, the zones and the quantities.

const num = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const card = 'dz-sheet min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5';
const h2 = 'text-lg font-bold text-slate-900';

export function StyleBoard({ d }: { d: DesignProject }) {
  return (
    <section className={card} aria-labelledby="dz-style">
      <h2 id="dz-style" className={h2}>
        Концепция: {d.style.title.toLowerCase()} стиль
      </h2>
      <p className="mt-1 text-sm text-slate-600">{d.style.mood}.</p>
      <ul className="mt-4 grid grid-cols-5 gap-2" aria-label="Палитра">
        {d.palette.map((s) => (
          <li key={s.hex} className="min-w-0">
            <span
              className="block aspect-square w-full rounded-xl border border-slate-200 print:aspect-auto print:h-12 print:border-slate-400"
              style={{
                background: s.hex,
                printColorAdjust: 'exact',
                WebkitPrintColorAdjust: 'exact',
              }}
            />
            <span className="mt-1 block truncate text-[11px] font-semibold text-slate-800 sm:text-xs">
              {s.name}
            </span>
            <span className="block font-mono text-[10px] text-slate-500 sm:text-xs">{s.hex}</span>
          </li>
        ))}
      </ul>
      {d.building && (
        <p className="mt-3 text-sm text-slate-600">
          <span className="font-semibold text-slate-800">Фасад и кровля:</span> {d.style.facade}.
        </p>
      )}
      {d.finishes.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-xs sm:text-sm">
            <caption className="mb-2 text-left text-sm font-semibold text-slate-800">
              Отделка по помещениям
            </caption>
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 pr-2 font-medium">Помещение</th>
                <th className="py-1 pr-2 font-medium">Пол</th>
                <th className="py-1 pr-2 font-medium">Стены</th>
                <th className="py-1 font-medium">Потолок</th>
              </tr>
            </thead>
            <tbody>
              {d.finishes.map((f) => (
                <tr key={f.kind} className="border-t border-slate-100 align-top">
                  <td className="py-1.5 pr-2 font-semibold text-slate-800">{f.name}</td>
                  <td className="py-1.5 pr-2">{f.finish.floor}</td>
                  <td className="py-1.5 pr-2">{f.finish.walls}</td>
                  <td className="py-1.5">{f.finish.ceiling}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Сценарий освещения</h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">
            {d.lighting.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Мебель и зонирование</h3>
          <p className="mt-1 text-sm text-slate-600">{d.style.furniture}.</p>
          {d.finishes.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
              {d.finishes
                .filter((f) => !['storage', 'hall', 'vestibule'].includes(f.kind))
                .slice(0, 6)
                .map((f) => (
                  <li key={f.kind}>
                    <span className="font-medium text-slate-800">{f.name}:</span> {f.furniture}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export function SpecSheet({ d }: { d: DesignProject }) {
  if (d.landscape && d.land) {
    const l = d.landscape;
    const rows = [
      ...l.zones.reduce<{ name: string; area: number; kind: keyof typeof ZONE_FILL }[]>(
        (acc, z) => {
          const row = acc.find((r) => r.kind === z.kind);
          if (row) row.area += z.area;
          else acc.push({ name: z.name, area: z.area, kind: z.kind });
          return acc;
        },
        [],
      ),
      { name: 'Газон (свободный)', area: l.openLawn, kind: 'lawn' as const },
    ];
    return (
      <section className={`${card} dz-break`} aria-labelledby="dz-spec">
        <h2 id="dz-spec" className={h2}>
          Ведомость участка
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Участок {num(l.W)}×{num(l.L)} м = {num(l.W * l.L)} м² ({num((l.W * l.L) / 100)} сот.)
        </p>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 font-medium">Зона</th>
              <th className="py-1 text-right font-medium">Площадь, м²</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-slate-100">
                <td className="py-1.5">
                  <span
                    className="mr-2 inline-block h-3 w-3 rounded-sm border border-slate-300 align-middle"
                    style={{
                      background: ZONE_FILL[r.kind],
                      printColorAdjust: 'exact',
                      WebkitPrintColorAdjust: 'exact',
                    }}
                  />
                  {r.name}
                </td>
                <td className="py-1.5 text-right tabular-nums">{num(r.area)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 className="mt-5 text-sm font-semibold text-slate-800">Объёмы работ и материалов</h3>
        <table className="mt-2 w-full text-left text-sm">
          <tbody>
            {d.land.map((q) => (
              <tr key={q.name} className="border-t border-slate-100">
                <td className="py-1.5 pr-2">{q.name}</td>
                <td className="whitespace-nowrap py-1.5 text-right tabular-nums">
                  {num(q.value)} {q.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }
  if (!d.spec || !d.building) return null;
  const { rows, totals, materials } = d.spec;
  const many = d.building.floors.length > 1;
  return (
    <section className={`${card} dz-break`} aria-labelledby="dz-spec">
      <h2 id="dz-spec" className={h2}>
        Ведомость помещений и отделки
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Высота потолков {num(d.building.ceiling)} м. Стены — за вычетом дверных (высота 2,1 м) и
        оконных проёмов.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-xs sm:text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 pr-2 font-medium">№</th>
              <th className="py-1 pr-2 font-medium">Помещение</th>
              <th className="py-1 pr-2 text-right font-medium">Пол, м²</th>
              <th className="py-1 pr-2 text-right font-medium">Стены, м²</th>
              <th className="py-1 pr-2 text-right font-medium">Потолок, м²</th>
              <th className="py-1 text-right font-medium">Двери / окна</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-1.5 pr-2 text-slate-500">
                  {many ? `${r.floor + 1}.` : ''}
                  {rows.slice(0, i + 1).filter((x) => x.floor === r.floor).length}
                </td>
                <td className="py-1.5 pr-2">{r.name}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{num(r.area)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{num(r.walls)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{num(r.ceiling)}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {r.doors} / {r.windows}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="font-semibold">
            <tr className="border-t-2 border-slate-300">
              <td />
              <td className="py-1.5 pr-2">Итого</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{num(totals.area)}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{num(totals.walls)}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{num(totals.ceiling)}</td>
              <td className="py-1.5 text-right tabular-nums">
                {totals.doors} / {totals.windows}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Жилая площадь {num(totals.living)} м² · проёмов всего {totals.openings} (дверей и ворот{' '}
        {totals.doors}, окон {totals.windows})
      </p>
      <h3 className="mt-5 text-sm font-semibold text-slate-800">
        Материалы отделки с запасом на подрезку
      </h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-xs sm:text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 pr-2 font-medium">Поверхность</th>
              <th className="py-1 pr-2 font-medium">Материал</th>
              <th className="py-1 pr-2 text-right font-medium">Площадь</th>
              <th className="py-1 text-right font-medium">Заказать</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <tr key={`${m.surface}${m.name}`} className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-2 text-slate-500">{m.surface}</td>
                <td className="py-1.5 pr-2">{m.name}</td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums">
                  {num(m.area)} м²
                </td>
                <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{m.order} м²</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
