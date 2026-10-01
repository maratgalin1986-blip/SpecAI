import type { Metadata } from 'next';
import { CinemaHero } from '@/components/CinemaHero';
import { PHOTO_CREDITS } from '@/lib/photoCredits';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Авторы фото и видео',
  description: `Источники иллюстраций на сайте ${SITE.name}.`,
  robots: { index: false },
};

export default function CreditsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-6">
      <CinemaHero
        eyebrow="Документы"
        title="Авторы фото и видео"
        clips={['site-aerial']}
        camera={7}
        still
      />
      <p className="text-slate-600">
        Фото и видео на сайте — иллюстрации, это не техника {SITE.name}. Ролики — из бесплатной
        библиотеки Mixkit (лицензия Mixkit), часть фото техники сгенерирована для сайта, фото
        самосвалов, бульдозера и трактора — с Wikimedia Commons:
      </p>
      <ul className="flex flex-col gap-3">
        {PHOTO_CREDITS.map((credit) => (
          <li key={credit.file} className="flex gap-4 rounded-xl border border-slate-200 p-3">
            <img
              src={credit.file}
              alt=""
              width={120}
              height={68}
              loading="lazy"
              className="h-[68px] w-[120px] shrink-0 rounded-md object-cover"
            />
            <div className="min-w-0 text-sm">
              <a href={credit.url} target="_blank" rel="noopener" className="font-medium underline">
                {credit.title}
              </a>
              <div className="text-slate-500">
                Автор: {credit.author} · {credit.license}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-slate-500">
        Mixkit:{' '}
        <a href="https://mixkit.co/license/" target="_blank" rel="noopener" className="underline">
          mixkit.co/license
        </a>
      </p>
    </div>
  );
}
