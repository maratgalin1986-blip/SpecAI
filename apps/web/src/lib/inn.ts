// ИНН: 10 цифр у организации, 12 — у ИП, самозанятого и физлица. Последние
// одна (10) или две (12) цифры — контрольные, по весам ФНС. Проверка ловит
// опечатки, но не говорит, что ИНН существует: это проверяет админ при модерации.

const W10 = [2, 4, 10, 3, 5, 9, 4, 6, 8];
const W11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
const W12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];

function check(digits: number[], weights: number[]): number {
  const sum = weights.reduce((acc, weight, index) => acc + weight * digits[index]!, 0);
  return (sum % 11) % 10;
}

/** Только цифры из того, что ввели («7707 08-38-93» → «7707083893»). */
export function cleanInn(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\D/g, '') : '';
}

/** ИНН из 10 или 12 цифр с верными контрольными цифрами. */
export function isValidInn(raw: unknown): boolean {
  const inn = cleanInn(raw);
  if (!/^(\d{10}|\d{12})$/.test(inn) || /^0+$/.test(inn)) return false;
  const digits = [...inn].map(Number);
  if (inn.length === 10) return check(digits, W10) === digits[9];
  return check(digits, W11) === digits[10] && check(digits, W12) === digits[11];
}

/** Сколько цифр должно быть в ИНН для этой формы: 10 у юрлица, 12 у остальных. */
export function innLengthFor(legalForm: string): 10 | 12 {
  return legalForm === 'LEGAL' ? 10 : 12;
}
