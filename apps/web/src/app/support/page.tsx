import type { Metadata } from 'next';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: `Поддержать проект — ${SITE.name}`,
  description:
    'Сервис бесплатный для всех. Если он вам помог, можно добровольно поддержать проект.',
};

// Voluntary support. The link is set by the owner in NEXT_PUBLIC_DONATE_URL
// (a donation page such as ЮMoney, Т-Банк or Boosty); without it the page
// only explains that the service is free.
export default function SupportPage() {
  const donateUrl = process.env.NEXT_PUBLIC_DONATE_URL;
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center">
      <div className="text-6xl">♥</div>
      <h1 className="mt-4 text-3xl font-bold">Поддержать проект</h1>
      <p className="mt-3 text-slate-600">
        Сервис {SITE.name} бесплатный для всех: бронирование, заявки, приложение и ИИ-помощник — без
        предоплаты и комиссий. Если он вам помог, вы можете добровольно поддержать развитие сайта и
        приложения. Это не обязательно и ни на что не влияет.
      </p>
      {donateUrl ? (
        <a
          href={donateUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 rounded-md bg-amber-600 px-6 py-3 text-base font-semibold text-white hover:bg-amber-500"
        >
          Поддержать проект
        </a>
      ) : (
        <p className="mt-6 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Ссылка для поддержки скоро появится. А пока лучшая поддержка — расскажите о нас коллегам.
        </p>
      )}
      <a href="/" className="mt-6 text-sm font-medium text-amber-700">
        На главную
      </a>
    </div>
  );
}
