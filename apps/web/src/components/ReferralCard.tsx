import { ShareButtons } from '@/components/ShareButtons';
import { colleaguesLabel, invitationText, recommendsNote } from '@/lib/referral';

// «Пригласи коллегу» in both cabinets: the personal link, share buttons and
// how many people signed up with it. Rewards are non-monetary: a provider
// that brought other providers gets «Рекомендует N» on its public page.

export function ReferralCard({
  link,
  role,
  invited,
}: {
  link: string;
  role: 'CUSTOMER' | 'PROVIDER';
  invited: { total: number; providers: number };
}) {
  const note = role === 'PROVIDER' ? recommendsNote(invited.providers) : null;
  return (
    <section id="invite" className="cab-card flex scroll-mt-24 flex-col gap-3">
      <div>
        <p className="cab-eyebrow">Пригласи коллегу</p>
        <h2 className="mt-1 text-lg font-bold text-graphite-950">
          {role === 'PROVIDER'
            ? 'Больше исполнителей — больше заявок в городе'
            : 'Знаете, кому нужна техника?'}
        </h2>
        <p className="mt-1 text-sm text-graphite-600">
          {role === 'PROVIDER'
            ? 'Заказчики приходят туда, где есть выбор. Позовите знакомые компании и частников с техникой — за каждого на вашей странице появится отметка «Рекомендует».'
            : 'Отправьте ссылку прорабу или знакомому подрядчику: заявки и предложения бесплатны.'}
        </p>
      </div>
      <p className="break-all rounded-xl bg-graphite-50 px-3 py-2 font-mono text-sm text-graphite-900">
        {link}
      </p>
      <ShareButtons url={link} text={invitationText(role)} tag={false} label="" />
      <p className="text-sm text-graphite-700">
        {invited.total > 0
          ? `По вашей ссылке зарегистрировались: ${invited.total}`
          : 'По вашей ссылке пока никто не зарегистрировался.'}
        {role === 'PROVIDER' && invited.providers > 0 && <> · исполнителей: {invited.providers}</>}
      </p>
      {note && (
        <p className="w-fit rounded-full bg-signal-50 px-3 py-1 text-xs font-semibold text-signal-800">
          {note}
        </p>
      )}
      {role === 'PROVIDER' && invited.providers === 0 && (
        <p className="text-xs text-graphite-500">
          Пригласите {colleaguesLabel(1)} — и отметка появится на вашей странице.
        </p>
      )}
    </section>
  );
}
