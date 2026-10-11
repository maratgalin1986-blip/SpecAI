'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PROVIDER_DOCUMENT_KINDS,
  PROVIDER_DOCUMENT_KIND_LABELS,
  providerDocumentKindLabel,
  type ProviderDocumentKind,
} from '@specai/shared';
import { DOCUMENT_STATUS_LABELS, type DocumentStatus } from '@/lib/documents';

// «Документы» in the provider cabinet: СТС, ПСМ, права машиниста, страховка,
// техосмотр — for the company, a machine or an operator, with the expiry.
// The daily cron reminds 30 days before and on the day (lib/documents.ts).

export interface DocumentRow {
  id: string;
  kind: string;
  number: string | null;
  equipmentId: string | null;
  operatorName: string | null;
  fileUrl: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  status: DocumentStatus;
}

const STATUS_CLASS: Record<DocumentStatus, string> = {
  ok: 'bg-green-100 text-green-800',
  expiring: 'bg-amber-100 text-amber-900',
  expired: 'bg-red-100 text-red-800',
  none: 'bg-graphite-100 text-graphite-700',
};

const day = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) : '—';

export function ProviderDocuments({ machines }: { machines: { id: string; name: string }[] }) {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<ProviderDocumentKind>('STS');
  const [equipmentId, setEquipmentId] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [number, setNumber] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/documents');
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Не удалось загрузить документы');
        setDocuments([]);
        return;
      }
      setDocuments(body.documents ?? []);
    } catch {
      setError('Нет связи с сервером');
      setDocuments([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          equipmentId: equipmentId || null,
          operatorName: operatorName || null,
          number: number || null,
          issuedAt: issuedAt || null,
          expiresAt: expiresAt || null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Не удалось сохранить документ');
        return;
      }
      setNumber('');
      setIssuedAt('');
      setExpiresAt('');
      await load();
      router.refresh();
    } catch {
      setError('Нет связи с сервером');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Удалить документ?')) return;
    const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      setDocuments((prev) => (prev ?? []).filter((doc) => doc.id !== id));
      router.refresh();
    }
  }

  const machineName = (id: string | null) => machines.find((item) => item.id === id)?.name;
  const field = 'min-h-[44px] rounded-xl border border-graphite-200 px-3 text-sm';

  return (
    <div className="flex flex-col gap-4">
      {documents === null ? (
        <p className="text-sm text-graphite-500">Загружаем документы…</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-graphite-600">
          Документов пока нет. Добавьте СТС и ПСМ машин, удостоверения машинистов и страховку —
          напомним за 30 дней до окончания срока.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-graphite-200 bg-white px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-semibold text-graphite-950">
                  {providerDocumentKindLabel(doc.kind)}
                  {doc.number && ` № ${doc.number}`}
                </p>
                <p className="text-xs text-graphite-600">
                  {machineName(doc.equipmentId) ?? doc.operatorName ?? 'Компания'} · выдан{' '}
                  {day(doc.issuedAt)} · до {day(doc.expiresAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${STATUS_CLASS[doc.status]}`}
                >
                  {DOCUMENT_STATUS_LABELS[doc.status]}
                </span>
                <button
                  type="button"
                  onClick={() => void remove(doc.id)}
                  className="text-xs text-red-700 hover:underline"
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-graphite-700">
          Вид документа
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ProviderDocumentKind)}
            className={field}
          >
            {PROVIDER_DOCUMENT_KINDS.map((value) => (
              <option key={value} value={value}>
                {PROVIDER_DOCUMENT_KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-graphite-700">
          Машина
          <select
            value={equipmentId}
            onChange={(e) => setEquipmentId(e.target.value)}
            className={field}
          >
            <option value="">Вся компания / машинист</option>
            {machines.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-graphite-700">
          Машинист (для удостоверения)
          <input
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            maxLength={200}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-graphite-700">
          Номер
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            maxLength={100}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-graphite-700">
          Выдан
          <input
            type="date"
            value={issuedAt}
            onChange={(e) => setIssuedAt(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-graphite-700">
          Действует до
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={field}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700 sm:col-span-2">
            {error}
          </p>
        )}
        <div className="sm:col-span-2">
          <button type="submit" disabled={saving} className="cab-action">
            {saving ? 'Сохраняем…' : 'Добавить документ'}
          </button>
        </div>
      </form>
    </div>
  );
}
