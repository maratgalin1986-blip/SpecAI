'use client';

// «Сохранить в PDF или распечатать» на странице счёта (К8): печать браузера — в ней есть
// «Сохранить как PDF». На бумаге и в PDF кнопки нет (print:hidden).

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="self-start rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:border-slate-400 print:hidden"
    >
      {label}
    </button>
  );
}
