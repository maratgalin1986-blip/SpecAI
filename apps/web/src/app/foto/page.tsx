import type { Metadata } from 'next';
import { CinemaHero } from '@/components/CinemaHero';
import { PhotoShare } from '@/components/PhotoShare';
import { SITE } from '@/lib/site';

// The link the dispatcher sends after a job: «пришлите фото результата».
// /foto?kto=ispolnitel is the same for an executor (photos only).
export const metadata: Metadata = {
  title: 'Фото с объекта',
  description: `Поделитесь фото результата работ ${SITE.name}.`,
  robots: { index: false },
};

export default function PhotoPage({ searchParams }: { searchParams: { kto?: string } }) {
  const executor = searchParams.kto === 'ispolnitel';
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 py-6">
      <CinemaHero
        eyebrow="Спасибо за работу"
        title="Фото с объекта"
        clips={['site-aerial']}
        camera={3}
        still
      />
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <PhotoShare role={executor ? 'executor' : 'client'} stage="after" startOpen />
      </section>
    </div>
  );
}
