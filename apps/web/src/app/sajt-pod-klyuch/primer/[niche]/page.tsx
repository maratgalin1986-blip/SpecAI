import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DemoBanner } from '@/components/office/landing/DemoBanner';
import { OfficeSitePage } from '@/components/office/OfficeSitePage';
import {
  LANDING_EXAMPLES_ANCHOR,
  LANDING_FORM_ANCHOR,
  LANDING_PATH,
  demoNiche,
  demoSitePage,
} from '@/lib/office/landing';
import { nichesOf } from '@/lib/office/niches';

// Пример сайта (S3): шаблон клиентского сайта на вымышленной компании «Ваша <ниша>» в
// Казани с явной полосой «Пример». Телефон и WhatsApp — СпецПласт16, не выдуманные; без
// отзывов, цифр и чужих брендов; в поиск не попадает. Неизвестная ниша — 404.

// Страницы — по словарю ниш при сборке; другой адрес — 404 без рендера.
export const dynamicParams = false;

export function generateStaticParams(): { niche: string }[] {
  return nichesOf('sites').map((n) => ({ niche: n.key }));
}

export async function generateMetadata(props: {
  params: Promise<{ niche: string }>;
}): Promise<Metadata> {
  const { niche: key } = await props.params;
  const niche = demoNiche(key);
  if (!niche) return { title: 'Страница не найдена', robots: { index: false, follow: false } };
  return {
    title: `Пример сайта: ${niche.title.toLowerCase()}`,
    description: `Как выглядит сайт под ключ для ниши «${niche.title}»: пример на вымышленной компании.`,
    robots: { index: false, follow: true },
  };
}

export default async function SiteExamplePage(props: { params: Promise<{ niche: string }> }) {
  const { niche: key } = await props.params;
  const page = demoSitePage(key);
  if (!page) notFound();
  return (
    // Как /s и /preview: сайт клиента — во всю ширину, без полей основной колонки.
    <div className="-mx-4 -my-6 sm:-mx-6 sm:-my-8">
      <DemoBanner
        formHref={`${LANDING_PATH}#${LANDING_FORM_ANCHOR}`}
        examplesHref={`${LANDING_PATH}#${LANDING_EXAMPLES_ANCHOR}`}
      />
      <OfficeSitePage page={page} mode="preview" />
    </div>
  );
}
