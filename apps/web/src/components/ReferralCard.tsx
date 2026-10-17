import { ShareButtons } from '@/components/ShareButtons';
import { colleaguesLabel, invitationText, recommendsNote } from '@/lib/referral';
import {
  CUSTOMER_INVITE_NOTE,
  INVITE_DETAIL,
  INVITE_HEADLINE,
  priorityBadgeText,
} from '@/lib/referralPriority';

// «Пригласи коллегу» in both cabinets: the personal link, share buttons and
// how many people signed up with it. Rewards are non-monetary: a provider
// that brought other providers gets «Рекомендует N» on its public page, and
// every friend signed up gives a week of new-order alerts 5 minutes before
// the other providers (акция «Пригласи друга», lib/referralPriority.ts).

export function ReferralCard({
  link,
  role,
  invited,
  priorityUntil,
}: {
  link: string;
  role: 'CUSTOMER' | 'PROVIDER';
  invited: { total: number; providers: number };
  priorityUntil?: Date | null;
}) {
  const note = role === 'PROVIDER' ? recommendsNote(invited.providers) : null;
  const badge = role === 'PROVIDER' ? priorityBadgeText(priorityUntil, new Date()) : null;
  return (
    <section id="invite" className="cab-card flex scroll-mt-24 flex-col gap-3">
      <div>
        <p className="cab-eyebrow">Пригласи друга</p>
        <h2 className="mt-1 text-lg font-bold text-graphite-950">
          {role === 'PROVIDER' ? INVITE_HEADLINE : 'Знаете, кому нужна техника?'}
        </h2>
        <p className="mt-1 text-sm text-graphite-600">
          {role === 'PROVIDER'
            ? INVITE_DETAIL
            : 'Отправьте ссылку прорабу или знакомому подрядчику: заявки и предложения бесплатны.'}
        </p>
        {role === 'CUSTOMER' && (
          <p className="mt-1 text-xs text-graphite-500">{CUSTOMER_INVITE_NOTE}</p>
        )}
      </div>
      {badge && (
        <p className="w-fit rounded-full bg-signal-50 px-3 py-1 text-sm font-semibold text-signal-800">
          {badge}
        </p>
      )}
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
