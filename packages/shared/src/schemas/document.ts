import { z } from 'zod';

// A provider's documents (ProviderDocument): for the company, a machine or an
// operator. The kind is a plain string column, so the list can grow without
// touching the database enum (CLAUDE.md rule 2).

export const PROVIDER_DOCUMENT_KINDS = [
  'STS',
  'PSM',
  'OPERATOR_LICENSE',
  'OSAGO',
  'INSPECTION',
  'OTHER',
] as const;
export type ProviderDocumentKind = (typeof PROVIDER_DOCUMENT_KINDS)[number];

export const PROVIDER_DOCUMENT_KIND_LABELS: Record<ProviderDocumentKind, string> = {
  STS: 'СТС',
  PSM: 'ПСМ',
  OPERATOR_LICENSE: 'Удостоверение машиниста',
  OSAGO: 'Страховка ОСАГО',
  INSPECTION: 'Техосмотр',
  OTHER: 'Другое',
};

/** Label for a kind from the database (unknown values fall back to «Документ»). */
export function providerDocumentKindLabel(kind: string): string {
  return (PROVIDER_DOCUMENT_KIND_LABELS as Record<string, string>)[kind] ?? 'Документ';
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value || null);

const optionalDate = z
  .union([z.coerce.date(), z.null()])
  .optional()
  .transform((value) => value ?? null);

export const providerDocumentKindSchema = z.enum(PROVIDER_DOCUMENT_KINDS, {
  errorMap: () => ({ message: 'Выберите вид документа' }),
});

export const createProviderDocumentSchema = z
  .object({
    kind: providerDocumentKindSchema,
    // Equipment ids are not always cuids: the owner's fleet uses "sp16-*".
    equipmentId: optionalText(64),
    operatorName: optionalText(200),
    number: optionalText(100),
    fileUrl: optionalText(500),
    issuedAt: optionalDate,
    expiresAt: optionalDate,
  })
  .refine((data) => !data.issuedAt || !data.expiresAt || data.expiresAt >= data.issuedAt, {
    message: 'Срок действия не может быть раньше даты выдачи',
    path: ['expiresAt'],
  });
export type CreateProviderDocumentInput = z.infer<typeof createProviderDocumentSchema>;

export const updateProviderDocumentSchema = z.object({
  kind: providerDocumentKindSchema.optional(),
  equipmentId: optionalText(64),
  operatorName: optionalText(200),
  number: optionalText(100),
  fileUrl: optionalText(500),
  issuedAt: optionalDate,
  expiresAt: optionalDate,
});
export type UpdateProviderDocumentInput = z.infer<typeof updateProviderDocumentSchema>;
