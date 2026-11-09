import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { prisma } from '@specai/database';
import { CATEGORIES } from '@specai/shared';
import { OfficeProviderPage } from '@/components/office/OfficeProviderPage';
import { OfficeSitePage } from '@/components/office/OfficeSitePage';
import { PreviewBanner } from '@/components/office/PreviewBanner';
import { isAdminRequest } from '@/lib/admin';
import { nicheByKey } from '@/lib/office/niches';
import { buildProviderPage } from '@/lib/office/pages';
import { recordPreviewView } from '@/lib/office/previewViews';
import { loadProspectByToken, sitePageFor, toPageNiche, visibleFor } from '@/lib/office/visibility';

export const dynamic = 'force-dynamic';

// The private preview of a page the office made for a company (R11): opened
// by the owner of the platform through the secret link, shown with a banner,
// never indexed. The phone is on it (R13): only the owner sees the preview.
// A site shows the owner's edits (S5) as the published one will; its lead
// form is visible but off until publication (S4). Each opening by a person
// (not the owner, not a link-preview bot) is counted (U3, lib/office/previewViews.ts).

export const metadata: Metadata = {
  title: 'Предпросмотр страницы',
  robots: { index: false, follow: false, nocache: true },
};

/** Counting never breaks the page: any failure here is ignored. */
async function countView(token: string): Promise<void> {
  try {
    const isAdmin = await isAdminRequest();
    const userAgent = (await headers()).get('user-agent');
    await recordPreviewView(prisma, token, { isAdmin, userAgent });
  } catch {
    // The page matters more than the counter.
  }
}

export default async function PreviewPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const prospect = await loadProspectByToken(params.token);
  if (!prospect || !visibleFor(prospect, 'preview')) notFound();
  await countView(params.token);

  if (prospect.kind === 'site') {
    const niche = nicheByKey(prospect.niche);
    if (!niche) notFound();
    return (
      <>
        <PreviewBanner name={prospect.name} />
        <OfficeSitePage
          page={sitePageFor(prospect, toPageNiche(niche))}
          slug={prospect.slug}
          mode="preview"
        />
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
