// Admin search by phone or name (/admin/search, /admin/providers). Pure,
// unit-tested. Phones are stored as typed («+7 917 666-00-04», «8917…»), so
// they are compared by digits without the country prefix.

/** The digits of a phone without the leading 7/8 of a full Russian number. */
function phoneCore(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 11 && (digits[0] === '7' || digits[0] === '8')
    ? digits.slice(1)
    : digits;
}

/**
 * The digits to look for in a phone, or null when the query is not a phone
 * (fewer than 3 digits). «+7 917», «8 917» and «917» all look for «917».
 */
export function phoneNeedle(query: string): string | null {
  const trimmed = query.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (/^\+?7/.test(trimmed) || (/^8/.test(trimmed) && digits.length > 3)) digits = digits.slice(1);
  return digits.length >= 3 ? digits : null;
}

export function phoneMatches(phone: string | null | undefined, query: string): boolean {
  const needle = phoneNeedle(query);
  return Boolean(needle && phone && phoneCore(phone).includes(needle));
}

/** Any of the texts contains the query (any case), or a phone matches its digits. */
export function adminMatches(
  query: string,
  texts: (string | null | undefined)[],
  phones: (string | null | undefined)[] = [],
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  if (texts.some((text) => text?.toLowerCase().includes(needle))) return true;
  return phones.some((phone) => phoneMatches(phone, query));
}
