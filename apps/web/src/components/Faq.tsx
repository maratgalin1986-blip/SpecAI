import { Icon } from '@/components/Icon';

// FAQ block with schema.org FAQPage markup for rich results in Yandex/Google.
export function Faq({
  items,
  title = 'Частые вопросы',
}: {
  items: { q: string; a: string }[];
  title?: string;
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
  return (
    <section className="grid gap-8 lg:grid-cols-12">
      <div className="lg:sticky lg:top-28 lg:col-span-5 lg:self-start">
        <div className="eyebrow text-amber-600">FAQ</div>
        <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">{title}</h2>
      </div>
      <div className="flex flex-col gap-2 lg:col-span-7">
        {items.map((item) => (
          <details
            key={item.q}
            className="group rounded-2xl border border-slate-200 bg-white p-5 transition open:border-amber-300"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
              {item.q}
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition group-open:rotate-45 group-open:bg-amber-500 group-open:text-slate-950">
                <Icon name="plus" className="h-4 w-4" />
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.a}</p>
          </details>
        ))}
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </section>
  );
}
