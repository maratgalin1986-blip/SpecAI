import { previewBannerText } from '@/lib/office/pages';

/**
 * The yellow strip over a preview page (R11): the page is made for the company
 * and goes public only after its owner agrees. Server component; gets the
 * company name only, never the prospect row.
 */
export function PreviewBanner({ name }: { name: string }) {
  return (
    <div
      role="status"
      className="border-b border-amber-300 bg-amber-100 px-4 py-3 text-amber-950 sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-0.5">
        <p className="text-sm font-semibold leading-snug">{previewBannerText({ name })}</p>
        <p className="text-xs text-amber-800">Ссылка приватная, в поиск не попадает.</p>
      </div>
    </div>
  );
}
