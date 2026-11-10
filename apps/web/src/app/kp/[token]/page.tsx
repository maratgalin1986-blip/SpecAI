import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';
import { buildKp } from '@/lib/office/kp';
import { adminOfferView } from '@/lib/office/offerView';
import { officePrices } from '@/lib/office/prices';
import { recordPreviewView } from '@/lib/office/previewViews';
import { isValidToken, visibleFor } from '@/lib/office/visibility';
import { rub } from '@/lib/prices';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

// Коммерческое предложение одной фирме (владелец, 2026-11-10): открывается только по секретному
// токену из сообщения, не индексируется. Всё о фирме — из её досье и уже выбранного предложения
// (lib/office/kp.ts); ни телефона, ни адреса фирмы на странице нет. Открытие человеком (не
// админом и не ботом) считается просмотром превью — сигнал для обучения заходов.

export const metadata: Metadata = {
  title: 'Предложение для вашей компании',
  robots: { index: false, follow: false, nocache: true },
};

async function countView(token: string): Promise<void> {
  try {
    const isAdmin = await isAdminRequest();
    const userAgent = (await headers()).get('user-agent');
    await recordPreviewView(prisma, token, { isAdmin, userAgent });
  } catch {
    // Страница важнее счётчика.
  }
}

export default async function KpPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  if (!isValidToken(token)) notFound();
  const row = await prisma.prospect.findUnique({
    where: { token },
    select: {
      kind: true,
      status: true,
      name: true,
      city: true,
      dossierJson: true,
      offerJson: true,
      source: true,
      emailSentAt: true,
      whatsappSentAt: true,
    },
  });
  if (!row || row.kind !== 'site' || !visibleFor(row, 'preview')) notFound();
  await countView(token);

  const { dossier, offer } = adminOfferView(row);
  const kp = buildKp({
    name: row.name,
    city: row.city,
    dossier,
    offer,
    prices: await officePrices(),
  });
  const previewHref = `/preview/${token}`;

  return (
    <main className="min-h-screen bg-graphite-950 text-white">
      <section className="relative overflow-hidden px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-signal-400/20 blur-3xl"
        />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <p className="rounded-full border border-white/20 px-4 py-1 text-xs uppercase tracking-widest text-signal-300">
            Персональное предложение{kp.city ? ` · ${kp.city}` : ''}
          </p>
          <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">
            Ваш сайт уже готов: {kp.company}
          </h1>
          <p className="max-w-2xl text-base text-white/80 sm:text-lg">{kp.opener}</p>
          <a
            href={previewHref}
            className="rounded-xl bg-signal-400 px-8 py-4 text-base font-bold text-graphite-950 shadow-lg shadow-signal-400/30 transition hover:bg-signal-300"
          >
            Посмотреть мой сайт
          </a>
          <p className="text-xs text-white/50">
            Бесплатно и без обязательств: сначала смотрите, потом решаете.
          </p>
        </div>
      </section>

      {kp.stats.length > 0 && (
        <section className="px-4 pb-14 sm:px-6">
          <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
            {kp.stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center"
              >
                <p className="text-5xl font-extrabold text-signal-300">{stat.value}</p>
                <p className="mt-2 text-sm text-white/70">{stat.label}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-3 max-w-4xl text-center text-xs text-white/40">
            Посчитано по открытым карточкам компаний на карте.
          </p>
        </section>
      )}

      <section className="bg-white px-4 py-14 text-graphite-950 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Что сайт даст именно вам</h2>
          <ol className="mt-6 flex flex-col gap-4">
            {kp.bullets.map((bullet, i) => (
              <li key={i} className="flex gap-4 rounded-2xl bg-slate-50 p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-graphite-950 text-lg font-extrabold text-signal-300">
                  {i + 1}
                </span>
                <p className="text-base leading-relaxed">{bullet}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-extrabold sm:text-3xl">Сколько это стоит</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {kp.packages.map((pack) => (
              <div
                key={pack.key}
                className={`flex flex-col gap-4 rounded-2xl p-6 ${
                  pack.recommended
                    ? 'border-2 border-signal-400 bg-white/10'
                    : 'border border-white/10 bg-white/5'
                }`}
              >
                {pack.recommended && (
                  <p className="self-start rounded-full bg-signal-400 px-3 py-1 text-xs font-bold text-graphite-950">
                    Советуем вам
                  </p>
                )}
                <h3 className="text-xl font-bold">{pack.title}</h3>
                <p>
                  <span className="text-4xl font-extrabold text-signal-300">
                    {rub(pack.setup)} ₽
                  </span>
                  <span className="ml-2 text-sm text-white/60">один раз</span>
                </p>
                <p className="text-sm text-white/70">
                  Дальше поддержка {rub(pack.monthly)} ₽ в месяц или {rub(pack.yearly)} ₽ за год.
                </p>
                <ul className="flex flex-col gap-2 text-sm text-white/80">
                  {pack.includes.map((line) => (
                    <li key={line} className="flex gap-2">
                      <span aria-hidden className="text-signal-300">
                        ✓
                      </span>
                      {line}
                    </li>
                  ))}
                </ul>
                {pack.recommended && (
                  <p className="text-xs text-white/50">Почему он: {kp.packageReason}.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-14 text-graphite-950 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-extrabold sm:text-3xl">Три шага до запуска</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            {kp.steps.map((step, i) => (
              <div key={step.title} className="rounded-2xl bg-slate-50 p-6">
                <p className="text-sm font-bold text-signal-700">Шаг {i + 1}</p>
                <h3 className="mt-1 text-lg font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-graphite-700">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 text-center sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-5">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Нравится? Напишите нам</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={previewHref}
              className="rounded-xl bg-signal-400 px-6 py-3 font-bold text-graphite-950"
            >
              Посмотреть мой сайт
            </a>
            <a
              href={SITE.whatsappHref}
              className="rounded-xl border border-white/30 px-6 py-3 font-bold"
            >
              Написать в WhatsApp
            </a>
            <a
              href={SITE.phoneHref}
              className="rounded-xl border border-white/30 px-6 py-3 font-bold"
            >
              {SITE.phone}
            </a>
          </div>
          <p className="text-xs text-white/50">
            {SITE.name}, площадка {SITE.platform}. Предложение подготовлено по открытым данным
            карточки компании на карте. Если не нужно — ответьте «стоп», больше не напишем.
          </p>
        </div>
      </section>
    </main>
  );
}
