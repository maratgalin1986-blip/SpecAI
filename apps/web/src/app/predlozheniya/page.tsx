import type { Metadata } from 'next';
import { ProposalForm } from '@/components/ProposalForm';
import { SITE } from '@/lib/site';

// «Предложения и партнёрство» (owner, 2026-10-17): a quiet page for ideas
// about the service and partnership offers. Reached from a text link in the
// footer, from /kak-polzovatsya and from the app; never a floating button.

export const metadata: Metadata = {
  title: 'Предложения и партнёрство',
  description: `Предложите идею, как сделать ${SITE.platform} удобнее, или расскажите о сотрудничестве и партнёрстве — мы читаем каждое сообщение.`,
  alternates: { canonical: '/predlozheniya' },
};

export default function ProposalsPage() {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 py-6 text-slate-700">
      <header className="flex flex-col gap-2">
        <p className="cab-eyebrow">Обратная связь</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Предложения и партнёрство
        </h1>
        <p>
          Есть идея, как сделать сервис удобнее, или хотите сотрудничать с {SITE.name}? Расскажите
          подробнее, что вы предлагаете — мы читаем каждое сообщение.
        </p>
      </header>
      <section className="cab-card">
        <ProposalForm />
      </section>
      <p className="text-sm text-slate-500">
        Нужна техника или вопрос по заказу — это быстрее по телефону{' '}
        <a href={SITE.phoneHref} className="font-semibold text-amber-700">
          {SITE.phone}
        </a>
        .
      </p>
    </article>
  );
}
