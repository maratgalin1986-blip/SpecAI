import type { Metadata } from 'next';
import { CinemaHero } from '@/components/CinemaHero';
import { qrSvg, qrTargetUrl } from '@/lib/qr';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'QR-код сайта',
  description: `Наведите камеру телефона — откроется сайт ${SITE.name}. Для визиток, техники и объявлений.`,
  robots: { index: false },
};

export default async function QrPage() {
  const svg = await qrSvg();
  const host = new URL(qrTargetUrl()).host;

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <CinemaHero
          eyebrow="Наведите камеру телефона"
          title="QR-код сайта"
          clips={['crane-sun', 'building-sun']}
          camera={7}
          compact
        >
          <p>Для визиток, наклеек на технику, объявлений и вывесок на объекте.</p>
        </CinemaHero>
      </div>

      <section className="grid items-center gap-8 rounded-3xl bg-slate-950 p-6 text-white ring-1 ring-white/10 sm:p-10 lg:grid-cols-[auto_1fr] print:bg-white print:text-slate-950 print:ring-0">
        <div className="qr-frame relative mx-auto w-full max-w-[20rem] rounded-2xl bg-white p-4">
          <div
            className="aspect-square w-full [&>svg]:h-full [&>svg]:w-full"
            role="img"
            aria-label={`QR-код: ${host}`}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <span
            className="qr-scan pointer-events-none absolute inset-x-4 top-4 h-0.5 print:hidden"
            aria-hidden
          />
          <span
            className="hud-corners pointer-events-none absolute -inset-3 print:hidden"
            aria-hidden
          />
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <div className="text-3xl font-extrabold tracking-tight">{SITE.name}</div>
            <p className="mt-1 text-white/70 print:text-slate-600">
              Аренда спецтехники с машинистом · {SITE.city}
            </p>
          </div>
          <a
            href={SITE.phoneHref}
            className="text-2xl font-bold text-amber-400 print:text-slate-950"
          >
            {SITE.phone}
          </a>
          <div className="font-mono text-sm text-white/60 print:text-slate-600">{host}</div>
          <ol className="flex flex-col gap-1 text-sm text-white/80 print:hidden">
            <li>1. Откройте камеру телефона.</li>
            <li>2. Наведите на код — появится ссылка на сайт.</li>
            <li>3. Нажмите на неё: каталог, цены и заявка за минуту.</li>
          </ol>
          <div className="flex flex-wrap gap-2 pt-2 print:hidden">
            <a
              href="/qr/code.png"
              download="specplast16-qr.png"
              className="rounded-full bg-amber-500 px-5 py-2.5 font-semibold text-slate-950 hover:bg-amber-400"
            >
              Скачать PNG
            </a>
            <a
              href="/qr/code.svg"
              download="specplast16-qr.svg"
              className="rounded-full bg-white/10 px-5 py-2.5 font-semibold ring-1 ring-white/20 hover:bg-white/20"
            >
              Скачать SVG для печати
            </a>
          </div>
          <p className="text-xs text-white/40 print:hidden">
            Переходы по коду видны в отчёте «Маркетинг» как канал qr.
          </p>
        </div>
      </section>
    </div>
  );
}
