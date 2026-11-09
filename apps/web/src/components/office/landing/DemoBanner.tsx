import { SITE } from '@/lib/site';

// Полоса над примером сайта (S3): компания вымышленная, звонок и WhatsApp на странице
// ведут к СпецПласт16. Серверный компонент, без данных кандидатов.

export function DemoBanner({ formHref, examplesHref }: { formHref: string; examplesHref: string }) {
  return (
    <div
      role="note"
      className="border-b border-amber-300 bg-amber-100 px-4 py-3 text-amber-950 sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold leading-snug">
            Пример сайта: компания вымышленная. Ваш сайт будет с вашими данными.
          </p>
          <p className="text-xs text-amber-800">
            Кнопки «Позвонить» и «WhatsApp» здесь ведут к {SITE.name} — расскажем, как сделать такой
            сайт для вас.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a
            href={formHref}
            className="inline-flex min-h-11 items-center rounded-full bg-amber-950 px-4 text-sm font-bold text-amber-50 hover:bg-amber-900"
          >
            Хочу такой сайт
          </a>
          <a
            href={examplesHref}
            className="inline-flex min-h-11 items-center rounded-full border border-amber-400 bg-white/60 px-4 text-sm font-semibold text-amber-950 hover:bg-white"
          >
            Все примеры
          </a>
        </div>
      </div>
    </div>
  );
}
