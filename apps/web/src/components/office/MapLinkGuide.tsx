import { mapLinkGuide } from '@/lib/office/billing';

// «Как поставить ссылку на сайт в карточку Яндекс Карт и 2ГИС» (К16): шаги текстом из
// mapLinkGuide. Серверный компонент без состояния — на странице счёта после оплаты и в
// админке «Клиенты».

export const MAP_LINK_GUIDE_TITLE = 'Как поставить ссылку на сайт в карточку Яндекс Карт и 2ГИС';

export function MapLinkGuide({ siteHref }: { siteHref: string }) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p>
        Ссылку в карточку может поставить только владелец карточки. Без неё сайт почти никто не
        найдёт: люди ищут компании на картах и переходят на сайт оттуда.
      </p>
      {mapLinkGuide(siteHref).map((section) => (
        <div key={section.title} className="flex flex-col gap-2">
          <h3 className="font-bold">{section.title}</h3>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5">
            {section.steps.map((step) => (
              <li key={step} className="break-words">
                {step}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
