import { loadLineNearby } from './lineNearbyData';
import { NEARBY_MAX_KM } from './linePresence';
import { offerCards, type OfferCard } from './offerNow';

/**
 * The «Заказать технику» lists from the database (lib/offerNow.ts): the
 * freshest machines on the line across Russia — the browser puts the nearest
 * first when it knows where the visitor is. Empty without a database, so the
 * page still renders (logged).
 */
export async function loadOfferNow(): Promise<{ house: OfferCard[]; line: OfferCard[] }> {
  try {
    const { machines, base } = await loadLineNearby(null, NEARBY_MAX_KM);
    return offerCards(machines, base);
  } catch (error) {
    console.error('Failed to load the machines for «Заказать технику»', error);
    return { house: [], line: [] };
  }
}
