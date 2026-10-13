/**
 * A phone the admin can call in one tap; «нет телефона» when there is none,
 * and plain text for a contact that is not a number («Telegram @name»).
 */
export function PhoneLink({ phone }: { phone: string | null | undefined }) {
  const value = phone?.trim();
  if (!value) return <span className="text-graphite-400">нет телефона</span>;
  const dial = value.replace(/[^\d+]/g, '');
  if (dial.replace(/\D/g, '').length < 5) return <span className="break-all">{value}</span>;
  return (
    <a
      href={`tel:${dial}`}
      className="whitespace-nowrap font-semibold text-signal-700 hover:underline"
    >
      {value}
    </a>
  );
}
