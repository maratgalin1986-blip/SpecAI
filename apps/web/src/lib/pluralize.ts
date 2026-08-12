/** Picks the correct Russian plural form for a count. `forms` is [one, few, many], e.g. ['день', 'дня', 'дней']. */
export function pluralizeRu(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  let form: string;
  if (mod10 === 1 && mod100 !== 11) {
    form = forms[0];
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    form = forms[1];
  } else {
    form = forms[2];
  }

  return `${count} ${form}`;
}
