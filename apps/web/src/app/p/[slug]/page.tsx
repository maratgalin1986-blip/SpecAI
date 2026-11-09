import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CATEGORIES } from '@specai/shared';
import { OfficeProviderPage } from '@/components/office/OfficeProviderPage';
import { buildProviderPage } from '@/lib/office/pages';
import { loadProspectBySlug, visibleFor } from '@/lib/office/visibility';

export const dynamic = 'force-dynamic';

// The published page of a machinery company the office found (R12): visible
// once the company agreed (PUBLISHED) or signed up from it (REGISTERED);
// otherwise 404. Public, indexable and in the sitemap (app/sitemap.ts, S11).
// The phone is shown: the company agreed (R13).

async function loadProviderPage(slug: string) {
  const prospect = await loadProspectBySlug(slug);
  if (!prospect || !visibleFor(prospect, 'provider')) return null;
  return buildProviderPage(prospect, [...CATEGORIES], { published: true });
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const page = await loadProviderPage(params.slug).catch(() => null);
  if (!page) return { title: 'Исполнитель не найден', robots: { index: false } };
  const title = `${page.title} — аренда спецтехники${page.city ? `, ${page.city}` : ''}`;
  const description = `${page.title}: ${page.machines.join(', ').toLowerCase()}${
    page.city ? ` · ${page.city}` : ''
  } · заявка бесплатно`;
  return {
    title,
    description,
    alternates: { canonical: `/p/${encodeURIComponent(params.slug)}` },
  };
}

export default async function OfficeProviderPublicPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const params = await props.params;
  const page = await loadProviderPage(params.slug);
  if (!page) notFound();
  return <OfficeProviderPage page={page} />;
}
