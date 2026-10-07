import Script from 'next/script';
import { SITE } from '@/lib/site';
import { metrikaInitScript, metrikaTagSrc } from '@/lib/marketing';

// Yandex.Metrika visit analytics, with the counter from SITE.metrikaId
// (NEXT_PUBLIC_YANDEX_METRIKA_ID overrides it). Only the production
// deployment counts, and never the owner's /admin pages (clients' names and
// phones must not reach Webvisor, the owner's calls are not goals).
//
// A server component: VERCEL_ENV is read on the server (at build for static
// pages, Vercel sets it there too), so local builds, previews and dev render
// nothing and no hit is ever sent from them.
//
// Nothing reaches Yandex before consent (152-ФЗ, owner's decision 2026-10-04).
// Without «Согласен» the inline script (metrikaInitScript) only creates the `ym` queue stub, so
// goals reached on this page wait in memory, and keeps the boot calls (init
// with Webvisor, the A/B params) in `window.__ymBoot`. «Согласен» or «Включить
// Метрику» call startMetrika (lib/marketing.ts): the boot calls go to the
// front of the queue and tag.js is requested on the same page. With consent
// stored, the boot calls are queued at once and the idle loader below fetches
// tag.js, as before. A refusal sets `window.__ymOff` and creates no queue.
// There is no noscript pixel: it cannot know about consent.
export function YandexMetrika() {
  const id = SITE.metrikaId;
  if (!/^\d+$/.test(id)) return null;
  if (process.env.VERCEL_ENV !== 'production') return null;
  const src = metrikaTagSrc(id);
  return (
    <>
      <script
        id="yandex-metrika-init"
        dangerouslySetInnerHTML={{ __html: metrikaInitScript(id) }}
      />
      <Script id="yandex-metrika" strategy="lazyOnload">
        {`(function(e,t,r){if(!window.ym||window.__ymOff||!window.__ymStarted)return;for(var j=0;j<e.scripts.length;j++){if(e.scripts[j].src===r){return;}}
var k=e.createElement(t),a=e.getElementsByTagName(t)[0];k.async=1;k.src=r;a.parentNode.insertBefore(k,a)})
(document,"script","${src}");`}
      </Script>
    </>
  );
}
