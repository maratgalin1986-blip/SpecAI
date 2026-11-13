import type { Metadata } from 'next';
import { Card } from '@specai/ui';
import { CallbackForm } from '@/components/CallbackForm';
import { SITE } from '@/lib/site';
import { CinemaBand } from '@/components/CinemaBand';
import { CinemaHero } from '@/components/CinemaHero';
import { pageMeta } from '@/lib/pageMeta';
import { Icon } from '@/components/Icon';
import { WhatsAppIcon } from '@/components/MessengerButtons';
import { TelegramButton } from '@/components/TelegramButton';

export const metadata: Metadata = pageMeta('/contacts', {
  title: 'Контакты',
  description: `Телефон, e-mail и заявка на звонок — ${SITE.platform} от ${SITE.name}: заказ спецтехники по всей России, офис в городе ${SITE.city}`,
});

export default function ContactsPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* The three ways to reach us come first: the page is opened for them,
          the film band is below. */}
      <nav
        aria-label="Связаться"
        data-contact-first
        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
      >
        <a
          href={SITE.phoneHref}
          className="inline-flex min-h-14 items-center justify-center gap-2.5 rounded-2xl bg-amber-500 px-4 font-mono text-lg font-bold tabular-nums text-slate-950 hover:bg-amber-400"
        >
          <Icon name="phone" className="h-5 w-5" />
          {SITE.phone}
        </a>
        <a
          href={SITE.whatsappHref}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 text-base font-semibold text-white hover:bg-emerald-600"
        >
          <WhatsAppIcon className="h-5 w-5" /> Написать в WhatsApp
        </a>
        <TelegramButton
          page="/contacts"
          label="Написать в Telegram"
          className="min-h-14 !rounded-2xl !text-base"
        />
      </nav>
      <CinemaHero
        eyebrow={`Вся Россия · офис ${SITE.name} — ${SITE.city}`}
        title="Контакты"
        clips={['crane-sun', 'building-sun']}
        camera={5}
        compact
      >
        <p>Звоните, пишите или оставьте заявку — подберём технику под вашу задачу.</p>
      </CinemaHero>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-4 p-6">
          <div>
            <div className="text-sm text-slate-500">Телефон</div>
            <a href={SITE.phoneHref} className="text-2xl font-bold text-slate-900">
              {SITE.phone}
            </a>
          </div>
          <div>
            <div className="text-sm text-slate-500">E-mail</div>
            <a href={`mailto:${SITE.email}`} className="text-lg font-semibold text-amber-700">
              {SITE.email}
            </a>
          </div>
          <div>
            <div className="text-sm text-slate-500">Где работаем</div>
            <div className="font-medium">
              По всей России — заявку видят исполнители рядом с объектом
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-500">Офис {SITE.name}</div>
            <div className="font-medium">
              {SITE.city}, {SITE.region}
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-500">Режим работы</div>
            <div className="font-medium">{SITE.workingHours}</div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <a
              href={SITE.phoneHref}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
            >
              Позвонить
            </a>
            <a
              href="/agents"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              Спросить помощника
            </a>
          </div>
          <a
            href="/qr"
            className="mt-2 flex items-center gap-4 rounded-xl border border-slate-200 p-3 hover:bg-slate-50"
          >
            <img
              src="/qr/code.svg"
              alt=""
              width={72}
              height={72}
              loading="lazy"
              className="shrink-0"
            />
            <span>
              <span className="block font-semibold text-slate-900">QR-код сайта</span>
              <span className="text-sm text-slate-500">
                Наведите камеру телефона — откроется сайт. Скачать для визиток и техники.
              </span>
            </span>
          </a>
        </Card>
        <Card className="p-6">
          <CallbackForm source="contacts" />
        </Card>
      </div>
      <CinemaBand
        machine="crane"
        clip="crane-dusk"
        eyebrow="Пн–Сб, 8:00–20:00"
        phrase="Звоните — подберём технику на ближайший день"
      />
    </div>
  );
}
