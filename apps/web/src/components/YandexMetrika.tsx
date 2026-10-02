import Script from 'next/script';
import { SITE } from '@/lib/site';

// Yandex.Metrika visit analytics, with the counter from SITE.metrikaId
// (NEXT_PUBLIC_YANDEX_METRIKA_ID overrides it). The counter's queue and init
// run inline right away, so goals reached in the first seconds are kept;
// tag.js itself loads once the page is idle and replays the queue. Only the
// production deployment counts, and never the owner's /admin pages (clients'
// names and phones must not reach Webvisor, the owner's calls are not goals).
//
// A server component: VERCEL_ENV is read on the server (at build for static
// pages, Vercel sets it there too), so local builds, previews and dev render
// nothing and no hit is ever sent from them.
//
// Webvisor (session recording) runs only after the visitor pressed «OK» in
// the cookie notice. Metrika cannot switch Webvisor on for a counter that is
// already initialised, so it starts from the next page load after «OK»; visits
// and goals are counted as before until the visitor refuses.
export function YandexMetrika() {
  const id = SITE.metrikaId;
  if (!/^\d+$/.test(id)) return null;
  if (process.env.VERCEL_ENV !== 'production') return null;
  return (
    <>
      <script
        id="yandex-metrika-init"
        dangerouslySetInnerHTML={{
          __html: `(function(m,i){var w=false;try{var v=localStorage.getItem('cookie-consent');if(v==='no')return;w=v==='yes'}catch(e){}if(/^\\/admin/.test(location.pathname))return;m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();m[i](${id},"init",{ssr:true,webvisor:w,clickmap:true,ecommerce:"dataLayer",referrer:document.referrer,url:location.href,accurateTrackBounce:true,trackLinks:true});var c=/(?:^|;\\s*)sp_ab=(cine|calm)/.exec(document.cookie);if(c)m[i](${id},"params",{ab:c[1]})})(window,"ym");`,
        }}
      />
      <Script id="yandex-metrika" strategy="lazyOnload">
        {`(function(e,t,r){if(!window.ym)return;for(var j=0;j<e.scripts.length;j++){if(e.scripts[j].src===r){return;}}
var k=e.createElement(t),a=e.getElementsByTagName(t)[0];k.async=1;k.src=r;a.parentNode.insertBefore(k,a)})
(document,"script","https://mc.yandex.ru/metrika/tag.js?id=${id}");`}
      </Script>
      {/* Raw HTML on purpose: as a JSX <img> React would add a preload for
          the pixel, so every visitor with JS would hit it too (double count). */}
      <noscript
        dangerouslySetInnerHTML={{
          __html: `<div><img src="https://mc.yandex.ru/watch/${id}" style="position:absolute;left:-9999px" alt="" /></div>`,
        }}
      />
    </>
  );
}
