import { useCallback, useEffect, useState } from 'react';
import { ApiError, fetchMyDocuments, type DocumentsSummary, type ProviderDocument } from './api';

/** Виды документов — как PROVIDER_DOCUMENT_KINDS в @specai/shared. */
export const DOCUMENT_KINDS: { value: string; label: string }[] = [
  { value: 'STS', label: 'СТС' },
  { value: 'PSM', label: 'ПСМ' },
  { value: 'OPERATOR_LICENSE', label: 'Удостоверение машиниста' },
  { value: 'OSAGO', label: 'Страховка ОСАГО' },
  { value: 'INSPECTION', label: 'Техосмотр' },
  { value: 'OTHER', label: 'Другое' },
];

export function documentKindLabel(kind: string): string {
  return DOCUMENT_KINDS.find((item) => item.value === kind)?.label ?? 'Документ';
}

export const DOCUMENT_STATUS_LABELS: Record<ProviderDocument['status'], string> = {
  ok: 'Действует',
  expiring: 'Скоро истекает',
  expired: 'Просрочен',
  none: 'Без срока',
};

/** Сколько просроченных документов у машины. */
export function expiredCountFor(documents: ProviderDocument[], equipmentId: string): number {
  return documents.filter((doc) => doc.equipmentId === equipmentId && doc.status === 'expired')
    .length;
}

/** Документы компании (GET /api/documents) с перезагрузкой. */
export function useProviderDocuments() {
  const [documents, setDocuments] = useState<ProviderDocument[] | null>(null);
  const [summary, setSummary] = useState<DocumentsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchMyDocuments();
      setDocuments(data.documents);
      setSummary(data.summary);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось загрузить документы');
      setDocuments((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { documents, summary, error, reload };
}
