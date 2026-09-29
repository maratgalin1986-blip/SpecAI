import Script from 'next/script';
import { SITE } from '@/lib/site';

// Yandex.Metrika visit analytics, with the counter from SITE.metrikaId
// (NEXT_PUBLIC_YANDEX_METRIKA_ID overrides it). Snippet as Metrika issues it,
// loaded once the page is idle so it does not compete with the first paint.
export function YandexMetrika() {
  const id = SITE.metrikaId;
  if (!/^\d+$/.test(id)) return null;
  return (
    <>
      <Script id="yandex-metrika" strategy="lazyOnload">
        {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window,document,"script","https://mc.yandex.ru/metrika/tag.js?id=${id}","ym");
ym(${id},"init",{ssr:true,webvisor:true,clickmap:true,ecommerce:"dataLayer",referrer:document.referrer,url:location.href,accurateTrackBounce:true,trackLinks:true});`}
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
