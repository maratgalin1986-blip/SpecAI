import type { GuideResult } from '@/lib/guide';

/** «Помощник: ваш следующий шаг» with the checklist folded underneath. */
export function GuideCard({ guide }: { guide: GuideResult }) {
  const { next, steps, progress } = guide;
  return (
    <section
      aria-label="Помощник"
      className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-slate-900"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
          Помощник: ваш следующий шаг
        </p>
        <span className="shrink-0 font-mono text-xs text-amber-800">
          {progress.done}/{progress.total}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-100">
        <div
          className="h-full rounded-full bg-amber-500"
          style={{ width: `${(progress.done / progress.total) * 100}%` }}
        />
      </div>
      <h2 className="mt-3 text-lg font-bold">{next.title}</h2>
      <p className="mt-1 text-sm text-slate-700">{next.hint}</p>
      {next.action && (
        <a
          href={next.action.href}
          className="mt-3 inline-block rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
        >
          {next.action.label}
        </a>
      )}
      <details className="mt-3 text-sm">
        <summary className="min-h-[44px] cursor-pointer py-3 text-amber-800">
          {guide.title}: все шаги
        </summary>
        <ol className="mt-2 flex flex-col gap-1.5">
          {steps.map((step) => (
            <li key={step.id} className="flex gap-2">
              <span aria-hidden>{step.done ? '✅' : step.id === next.id ? '👉' : '⬜'}</span>
              <span className={step.done ? 'text-slate-500 line-through' : ''}>
                {step.action && !step.done ? (
                  <a href={step.action.href} className="underline decoration-amber-400">
                    {step.title}
                  </a>
                ) : (
                  step.title
                )}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
