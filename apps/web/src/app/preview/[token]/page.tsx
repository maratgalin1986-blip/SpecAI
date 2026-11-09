import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CATEGORIES } from '@specai/shared';
import { OfficeProviderPage } from '@/components/office/OfficeProviderPage';
import { OfficeSitePage } from '@/components/office/OfficeSitePage';
import { PreviewBanner } from '@/components/office/PreviewBanner';
import { nicheByKey } from '@/lib/office/niches';
import { buildProviderPage, buildSitePage } from '@/lib/office/pages';
import { loadProspectByToken, toPageNiche, visibleFor } from '@/lib/office/visibility';

export const dynamic = 'force-dynamic';

// The private preview of a page the office made for a company (R11): opened
// by the owner of the platform through the secret link, shown with a banner,
// never indexed. The phone is on it (R13): only the owner sees the preview.

export const metadata: Metadata = {
  title: 'Предпросмотр страницы',
  robots: { index: false, follow: false, nocache: true },
};

export default async function PreviewPage({ params }: { params: { token: string } }) {
  const prospect = await loadProspectByToken(params.token);
  if (!prospect || !visibleFor(prospect, 'preview')) notFound();

  if (prospect.kind === 'site') {
    const niche = nicheByKey(prospect.niche);
    if (!niche) notFound();
    return (
      <>
        <PreviewBanner name={prospect.name} />
        <OfficeSitePage page={buildSitePage(prospect, toPageNiche(niche))} />
      </>
    );
  }

  const page = buildProviderPage(prospect, [...CATEGORIES], { published: true });
  return (
    <div className="flex flex-col gap-6">
      <PreviewBanner name={prospect.name} />
      <div className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6">
        <OfficeProviderPage page={page} />
      </div>
    </div>
  );
}
