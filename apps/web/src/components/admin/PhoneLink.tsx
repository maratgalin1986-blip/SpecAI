/** A phone the admin can call in one tap; «нет телефона» when there is none. */
export function PhoneLink({ phone }: { phone: string | null | undefined }) {
  const value = phone?.trim();
  if (!value) return <span className="text-graphite-400">нет телефона</span>;
  return (
    <a
      href={`tel:${value.replace(/[^\d+]/g, '')}`}
      className="whitespace-nowrap font-semibold text-signal-700 hover:underline"
    >
      {value}
    </a>
  );
}
