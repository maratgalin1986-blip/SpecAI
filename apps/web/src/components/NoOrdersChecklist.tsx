import { checklistProgress, type ChecklistItem } from '@/lib/providerDashboard';

// «Почему нет заказов?» (lib/providerDashboard.ts): what a provider can fix
// itself, unfinished items first. Collapsed when everything is done.

export function NoOrdersChecklist({ items }: { items: ChecklistItem[] }) {
  const { done, total } = checklistProgress(items);
  const sorted = [...items].sort((a, b) => Number(a.done) - Number(b.done));
  return (
    <details className="cab-card group" open={done < total}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="cab-eyebrow block">Почему нет заказов?</span>
          <span className="mt-1 block text-base font-bold text-graphite-950">
            Готовность профиля: {done} из {total}
          </span>
        </span>
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold text-graphite-950"
          style={{
            background: `conic-gradient(var(--sp-signal) ${(done / total) * 360}deg, #e8eaed 0)`,
          }}
          aria-hidden
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white">
            {Math.round((done / total) * 100)}%
          </span>
        </span>
      </summary>
      <ul className="mt-4 flex flex-col gap-2">
        {sorted.map((item) => (
          <li key={item.id}>
            <a
              href={item.href}
              className={`flex items-start gap-3 rounded-xl p-2 transition hover:bg-graphite-50 ${
                item.done ? 'opacity-70' : ''
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold ${
                  item.done
                    ? 'bg-graphite-900 text-signal-300'
                    : 'border-2 border-signal-500 text-signal-700'
                }`}
              >
                {item.done ? '✓' : '!'}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-graphite-900">
                  {item.title}
                  <span className="sr-only">{item.done ? ' — готово' : ' — нужно сделать'}</span>
                </span>
                {!item.done && <span className="block text-xs text-graphite-600">{item.hint}</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
