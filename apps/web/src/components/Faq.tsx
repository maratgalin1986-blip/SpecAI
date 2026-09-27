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
    <section>
      <h2 className="text-2xl font-bold">{title}</h2>
      <div className="mt-4 flex flex-col gap-2">
        {items.map((item) => (
          <details
            key={item.q}
            className="group rounded-xl border border-slate-200 bg-white p-4 open:border-amber-300"
          >
            <summary className="cursor-pointer list-none font-medium marker:hidden">
              <span className="mr-2 inline-block text-amber-600 transition group-open:rotate-45">
                +
              </span>
              {item.q}
            </summary>
            <p className="mt-2 text-sm text-slate-600">{item.a}</p>
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
