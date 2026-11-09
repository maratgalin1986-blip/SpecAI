import { previewBannerText, previewSourceCredit } from '@/lib/office/pages';

/**
 * The yellow strip over a preview page (R11, К6): a draft made by the platform from the open
 * data of the map card, not the company's official site; for an OpenStreetMap card — the
 * data credit (ODbL). Server component; gets the card's source only, never the prospect row.
 */
export function PreviewBanner({ source = null }: { source?: string | null }) {
  const credit = previewSourceCredit({ source });
  return (
    <div
      role="status"
      className="border-b border-amber-300 bg-amber-100 px-4 py-3 text-amber-950 sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-0.5">
        <p className="text-sm font-semibold leading-snug">{previewBannerText()}</p>
        <p className="text-xs text-amber-800">
          Ссылка приватная, в поиск не попадает. Формы на черновике выключены.
        </p>
        {credit && <p className="text-xs text-amber-800">{credit}</p>}
      </div>
    </div>
  );
}
