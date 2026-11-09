import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { nicheByKey } from '@/lib/office/niches';
import { buildSitePolicy } from '@/lib/office/sitePolicy';
import { loadProspectBySlug, sitePageFor, toPageNiche, visibleFor } from '@/lib/office/visibility';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

// Политика обработки персональных данных посетителей клиентского сайта (К17): оператор —
// компания (название, адрес и телефон — как на её сайте: карточка с правками владельца),
// приём заявок по поручению — СпецПласт16. Только у опубликованного сайта, без индексации,
// без id и служебных полей. Форма заявки ссылается сюда (SiteLeadForm).

/** The client's page, not the platform's: hide the platform chrome as on /s/<slug>. */
const HIDE_PLATFORM_CHROME =
  '[data-platform-chrome],.cine-curtain{display:none!important}main#content{max-width:none!important}';

async function loadPolicy(slug: string) {
  const prospect = await loadProspectBySlug(slug);
  if (!prospect || !visibleFor(prospect, 'site')) return null;
  const niche = nicheByKey(prospect.niche);
  if (!niche) return null;
  const page = sitePageFor(prospect, toPageNiche(niche));
  return {
    policy: buildSitePolicy(
      { name: page.title, address: page.address, city: page.city, phone: page.phone },
      SITE,
    ),
    slug: prospect.slug,
  };
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const found = await loadPolicy(params.slug).catch(() => null);
  return {
    title: { absolute: found ? found.policy.title : 'Страница не найдена' },
    robots: { index: false, follow: false },
  };
}

export default async function SitePolicyPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const found = await loadPolicy(params.slug);
  if (!found) notFound();
  const { policy, slug } = found;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: HIDE_PLATFORM_CHROME }} />
      <div data-client-site hidden />
      <article className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 bg-white px-4 py-10 text-slate-700 sm:px-6">
        <p className="text-sm">
          <a href={`/s/${encodeURIComponent(slug)}`} className="font-semibold hover:underline">
            ← Вернуться на сайт
          </a>
        </p>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-3xl">
          {policy.title}
        </h1>
        {policy.sections.map((section) => (
          <section key={section.title} className="flex flex-col gap-2">
            <h2 className="text-lg font-bold text-slate-900">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="break-words text-base leading-relaxed">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </article>
    </>
  );
}
