// «Заказываю от …» в заявке и брони (owner, 2026-10-28: «доделай следующим
// шагом»): снимок реквизитов юрлица заказчика на момент заказа — правки в
// «Реквизитах» потом не меняют прошлые заявки и документы. Исполнитель видит
// покупателя только с CONFIRMED/ACTIVE/COMPLETED, как телефон заказчика.

import { canSeeCustomerContacts } from './customerPrivacy';
import { legalFormLabel } from './providerVerification';

export interface BuyerSnapshot {
  legalForm: string;
  name: string;
  inn: string;
  kpp: string | null;
  address: string | null;
}

/** «как частное лицо» в форме заявки. */
export const AS_PERSON = 'person';

export function buyerSnapshot(entity: BuyerSnapshot): BuyerSnapshot {
  return {
    legalForm: entity.legalForm,
    name: entity.name,
    inn: entity.inn,
    kpp: entity.kpp ?? null,
    address: entity.address ?? null,
  };
}

/** Json-колонка → снимок; мусор и старые строки → null. */
export function parseBuyer(value: unknown): BuyerSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.name !== 'string' || typeof row.inn !== 'string') return null;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  return {
    legalForm: typeof row.legalForm === 'string' ? row.legalForm : 'LEGAL',
    name: row.name,
    inn: row.inn,
    kpp: text(row.kpp),
    address: text(row.address),
  };
}

/** Покупатель брони глазами исполнителя: до подтверждения — ничего. */
export function buyerForProvider(value: unknown, bookingStatus: string): BuyerSnapshot | null {
  return canSeeCustomerContacts(bookingStatus) ? parseBuyer(value) : null;
}

/** Одна строка для карточки и документов: «ООО «Ромашка», ИНН …, КПП …, адрес». */
export function buyerLine(buyer: BuyerSnapshot): string {
  const form = legalFormLabel(buyer.legalForm);
  const parts = [
    buyer.name,
    `ИНН ${buyer.inn}`,
    buyer.kpp ? `КПП ${buyer.kpp}` : null,
    buyer.address,
  ].filter(Boolean);
  return (form && !buyer.name.startsWith(form) ? `${form}: ` : '') + parts.join(', ');
}

export type BuyerChoice =
  { kind: 'default' } | { kind: 'person' } | { kind: 'entity'; id: string } | { kind: 'invalid' };

/**
 * `legalEntityId` из тела запроса: не передан — выбранное в «Заказываю от …»
 * (так работает и приложение, которое поле пока не шлёт); 'person' или null —
 * как частное лицо; строка — конкретное своё юрлицо.
 */
export function buyerChoice(raw: unknown): BuyerChoice {
  if (raw === undefined) return { kind: 'default' };
  if (raw === null || raw === AS_PERSON || raw === '') return { kind: 'person' };
  if (typeof raw === 'string' && raw.length <= 40) return { kind: 'entity', id: raw };
  return { kind: 'invalid' };
}

interface EntityFinder {
  legalEntity: {
    findFirst(args: {
      where: { userId: string; id?: string; isDefault?: boolean };
      select: Record<keyof BuyerSnapshot, true>;
    }): Promise<BuyerSnapshot | null>;
  };
}

const SELECT = { legalForm: true, name: true, inn: true, kpp: true, address: true } as const;

/** Снимок для новой заявки или брони; `error` — чужое или несуществующее юрлицо. */
export async function resolveBuyer(
  db: EntityFinder,
  userId: string,
  raw: unknown,
): Promise<{ buyer: BuyerSnapshot | null } | { error: string }> {
  const choice = buyerChoice(raw);
  if (choice.kind === 'invalid') return { error: 'Выберите, от кого заказываете' };
  if (choice.kind === 'person') return { buyer: null };
  const entity = await db.legalEntity.findFirst({
    where: choice.kind === 'entity' ? { userId, id: choice.id } : { userId, isDefault: true },
    select: SELECT,
  });
  if (!entity) {
    return choice.kind === 'entity'
      ? { error: 'Организация не найдена — выберите другую в «Заказываю от»' }
      : { buyer: null };
  }
  return { buyer: buyerSnapshot(entity) };
}

/** Снимок для Json-колонки `buyer` (undefined — «как частное лицо», колонка пустая). */
export function buyerJson(buyer: BuyerSnapshot | null): Record<string, string | null> | undefined {
  return buyer ? { ...buyer } : undefined;
}
