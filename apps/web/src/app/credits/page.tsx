import type { Metadata } from 'next';
import { CinemaHero } from '@/components/CinemaHero';
import { PHOTO_CREDITS } from '@/lib/photoCredits';
import { SOUND_CREDITS } from '@/lib/soundAssets';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Авторы фото, видео и звука',
  description: `Источники иллюстраций и звуков на сайте ${SITE.name}.`,
  robots: { index: false },
};

export default function CreditsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-6">
      <CinemaHero
        eyebrow="Документы"
        title="Авторы фото, видео и звука"
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

      <h2 className="mt-4 text-xl font-bold">Звук</h2>
      <p className="text-slate-600">
        Звук на сайте выключен, пока посетитель сам не нажмёт «🔇». Музыка, шум стройки, двигатели и
        гидравлика, щелчки, «удар» заставки и рация синтезируются прямо в браузере; голоса прорабов
        — синтез речи браузера. Запись дизеля — с Wikimedia Commons, фрагмент пережат в моно:
      </p>
      <ul className="flex flex-col gap-3">
        {SOUND_CREDITS.map((credit) => (
          <li key={credit.name} className="rounded-xl border border-slate-200 p-3 text-sm">
            <a href={credit.url} target="_blank" rel="noopener" className="font-medium underline">
              {credit.title}
            </a>
            <div className="text-slate-500">
              Автор: {credit.author} · {credit.license} · {credit.use}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-slate-500">
        Лицензия:{' '}
        <a
          href="https://creativecommons.org/publicdomain/zero/1.0/deed.ru"
          target="_blank"
          rel="noopener"
          className="underline"
        >
          CC0
        </a>
        . Изменения: фрагмент, моно, сжатие.
      </p>
    </div>
  );
}
