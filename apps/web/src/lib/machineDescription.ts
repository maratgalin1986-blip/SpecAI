import { keySpecs, specChip } from './equipmentCatalog';

// The search snippet of a machine's page (/equipment/<id>). A provider's own
// text often says little («Виброкаток с машинистом: уплотнение грунта.»), and
// a snippet under ~70 characters is thin for search results. Such a text is
// completed with what the card itself knows — make and model, year, the key
// specifications, the price and the city — never with an invented number.

/** Shorter than this, the description is completed from the machine's data. */
export const THIN_DESCRIPTION = 70;

export interface MachineFacts {
  name: string;
  categoryName: string;
  description: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  specs?: unknown;
  /** The price as the page shows it: «от 4 500 ₽/ч». */
  price?: string | null;
  city?: string | null;
}

const sentence = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`);

export function machineDescription(facts: MachineFacts): string {
  const own = facts.description?.replace(/\s+/g, ' ').trim();
  const base = own || `Аренда: ${facts.name}, ${facts.categoryName.toLowerCase()} с машинистом`;
  if (base.length >= THIN_DESCRIPTION) return base;
  const inBase = base.toLowerCase();
  const known = `${inBase} ${facts.name.toLowerCase()}`;
  const makeModel = [facts.make, facts.model].filter(Boolean).join(' ').trim();
  const details = [
    // The card's name usually is the make and model already.
    makeModel && !known.includes(makeModel.toLowerCase()) ? makeModel : '',
    facts.year ? `${facts.year} г. выпуска` : '',
    ...keySpecs(facts.specs, 3).map(specChip),
  ].filter(Boolean);
  const parts = [sentence(base)];
  if (!inBase.includes(facts.name.toLowerCase()) || details.length > 0)
    parts.push(sentence([facts.name, ...details].join(', ')));
  if (facts.price) parts.push(sentence(`Аренда ${facts.price} с машинистом`));
  if (facts.city) parts.push(sentence(facts.city));
  return parts.join(' ');
}
