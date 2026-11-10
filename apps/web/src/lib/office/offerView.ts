// Досье и предложение одной фирмы для /admin/office/<id> (U3): как предложение ушло (из
// `offerJson`, с отметкой ИИ) или, если письма ещё не было, каким оно будет — `buildOffer` с
// первым подходящим заходом. Логика захода и текста — в offer.ts, здесь только выбор источника.

import { storedOfferOf } from './aiOffer';
import { parseDossier, type Dossier } from './dossier';
import { applicableAngles, buildOffer, type Offer } from './offer';

export interface AdminOfferView {
  dossier: Dossier | null;
  offer: Offer;
  /** true — так предложение ушло компании; false — так оно будет. */
  sent: boolean;
  /** Вступление и пункты переписал ИИ-аналитик. */
  ai: boolean;
}

export function adminOfferView(row: {
  name: string;
  dossierJson: string | null;
  offerJson: string | null;
  city?: string | null;
  /** Источник карточки и отметки отправки: по ним решается, годится ли записанное предложение. */
  source?: string | null;
  emailSentAt?: Date | null;
  whatsappSentAt?: Date | null;
}): AdminOfferView {
  const dossier = parseDossier(row.dossierJson, row.source);
  const sentOffer = storedOfferOf(row);
  if (sentOffer) {
    const { ai, ...offer } = sentOffer;
    return { dossier, offer, sent: true, ai };
  }
  const angle = applicableAngles(dossier)[0] ?? 'leads_to_email';
  return {
    dossier,
    offer: buildOffer({ dossier, angle, companyName: row.name, city: row.city }),
    sent: false,
    ai: false,
  };
}
