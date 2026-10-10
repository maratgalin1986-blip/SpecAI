import type { Timeline } from '@/lib/orderTimeline';

// The order as a status line (lib/orderTimeline.ts): finished steps filled,
// the current one pulsing in signal orange, then the next action. Vertical on
// phones, horizontal from `sm`.

export function OrderTimeline({ timeline }: { timeline: Timeline }) {
  return (
    <section className="cab-dark flex flex-col gap-4" aria-label="Ход заявки">
      <ol className="flex flex-col gap-3 sm:flex-row sm:gap-0">
        {timeline.steps.map((step, index) => {
          const last = index === timeline.steps.length - 1;
          return (
            <li
              key={step.id}
              className="relative flex items-center gap-3 sm:flex-1 sm:flex-col sm:items-start sm:gap-2"
              aria-current={step.state === 'current' ? 'step' : undefined}
            >
              <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
                {step.state === 'current' && (
                  <span className="absolute inset-0 animate-ping rounded-full bg-signal-500/40 motion-reduce:hidden" />
                )}
                <span
                  className={`relative flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    step.state === 'done'
                      ? 'bg-signal-500 text-graphite-950'
                      : step.state === 'current'
                        ? 'border-2 border-signal-400 bg-graphite-900 text-signal-300'
                        : 'border border-graphite-600 text-graphite-400'
                  }`}
                >
                  {step.state === 'done' ? '✓' : index + 1}
                </span>
              </span>
              {!last && (
                <span
                  aria-hidden
                  className={`absolute left-[13px] top-8 h-3 w-0.5 sm:left-9 sm:right-1 sm:top-[13px] sm:h-0.5 sm:w-auto ${
                    step.state === 'done' ? 'bg-signal-500' : 'bg-graphite-700'
                  }`}
                />
              )}
              <span
                className={`text-sm ${
                  step.state === 'upcoming'
                    ? 'text-graphite-400'
                    : step.state === 'current'
                      ? 'font-bold text-white'
                      : 'text-graphite-100'
                }`}
              >
                {step.title}
              </span>
            </li>
          );
        })}
      </ol>
      {timeline.cancelled && (
        <p className="w-fit rounded-full bg-graphite-700 px-3 py-1 text-xs font-semibold text-graphite-100">
          Заявка отменена
        </p>
      )}
      <div className="flex flex-col gap-3 rounded-2xl bg-graphite-800 p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-graphite-100">
          <span className="font-bold text-signal-300">Что дальше: </span>
          {timeline.next.text}
        </p>
        {timeline.next.action && (
          <a href={timeline.next.action.href} className="cab-action shrink-0">
            {timeline.next.action.label}
          </a>
        )}
      </div>
    </section>
  );
}
