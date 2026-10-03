import type { Metadata } from 'next';
import { DesignStudio } from '@/components/design/DesignStudio';
import { parseDesignQuery } from '@/lib/design';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Дизайн-проект бесплатно: дом, баня, гараж, квартира, участок',
  description: `Бесплатный эскизный дизайн-проект от ${SITE.name}: план с размерами, 3D-схема, палитра и материалы, ведомость отделки. Готовые дизайны и генерация своего варианта за секунду. Потом — смета на стройку и материалы с доставкой.`,
};

// Print: only the project sheets on A4, no header, footer, buttons or widgets.
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 10mm; }
  html, body { background: #fff !important; }
  body::before, body::after { display: none !important; }
  body > *:not(main) { display: none !important; }
  main { max-width: none !important; padding: 0 !important; margin: 0 !important; }
  .dz-intro, .dz-noprint { display: none !important; }
  .dz-print { gap: 6mm !important; }
  .dz-sheet { border: 0 !important; padding: 0 !important; break-inside: avoid; }
  .dz-plan { break-inside: avoid; }
  .dz-plan + .dz-plan { break-before: page; }
  .dz-plan svg { max-height: 245mm !important; width: 100% !important; }
  .dz-break { break-before: page; }
  table { min-width: 0 !important; }
  * { animation: none !important; transition: none !important; }
  /* Scroll-in effects of the site never ran for blocks below the fold. */
  /* (Not inside SVG: CSS transform would override the drawing's own.) */
  .dz-print, .dz-print *:not(svg, svg *) {
    opacity: 1 !important; transform: none !important; translate: none !important;
    clip-path: none !important; filter: none !important;
  }
}
`;

export default function DesignPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const initial = parseDesignQuery(searchParams);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="dz-intro flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
          Бесплатно · без регистрации
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Дизайн-проект
        </h1>
        <p className="max-w-2xl text-slate-600">
          Эскизный дизайн-проект дома, бани, гаража, квартиры или участка за секунду: планировка с
          размерами, 3D-схема, палитра и материалы по комнатам, ведомость отделки. Выберите готовый
          дизайн или создайте свой — каждый вариант оригинальный и рисуется прямо в браузере. А
          построить по проекту поможет {SITE.name}: техника с машинистом, материалы с доставкой.
        </p>
      </div>
      <DesignStudio initial={initial} />
    </div>
  );
}
