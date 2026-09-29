import type { Metadata } from 'next';
import { Card } from '@specai/ui';
import { CallbackForm } from '@/components/CallbackForm';
import { SITE } from '@/lib/site';
import { CinemaHero } from '@/components/CinemaHero';

export const metadata: Metadata = {
  title: 'Контакты',
  description: `Телефон, e-mail и заявка на звонок — ${SITE.name}, ${SITE.city}`,
};

export default function ContactsPage() {
  return (
    <div className="flex flex-col gap-6">
      <CinemaHero
        eyebrow={`${SITE.city} · ${SITE.region}`}
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
            <div className="text-sm text-slate-500">Регион работы</div>
            <div className="font-medium">
              {SITE.city} и {SITE.region}
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
              Спросить ИИ-агента
            </a>
          </div>
        </Card>
        <Card className="p-6">
          <CallbackForm source="contacts" />
        </Card>
      </div>
    </div>
  );
}
