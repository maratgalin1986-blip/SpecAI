'use client';

import { useState } from 'react';

export interface VerificationRow {
  id: string;
  name: string;
  legalForm: string | null;
  legalName: string | null;
  inn: string | null;
  taxRegime: string | null;
  phone: string | null;
  requestedAt: string;
  sts: { number: string | null; fileUrl: string | null } | null;
}

/**
 * /admin/providers → «Заявки на проверку»: исполнители, отправившие полную
 * регистрацию. Админ смотрит ИНН и фото СТС (закрытый файл) и одобряет —
 * появляется «Проверен» — или возвращает с причиной.
 */
export function AdminVerificationQueue({ rows }: { rows: VerificationRow[] }) {
  const [done, setDone] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, decision: 'approve' | 'reject') {
    let reason: string | null = null;
    if (decision === 'reject') {
      reason = window.prompt('Почему возвращаем? Исполнитель увидит этот текст') ?? null;
      if (!reason || reason.trim().length < 3) return;
    }
    setError(null);
    const response = await fetch(`/api/admin/companies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(decision === 'reject' ? { decision, reason } : { decision }),
    }).catch(() => null);
    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? 'Нет связи');
      return;
    }
    setDone((prev) => ({ ...prev, [id]: decision === 'approve' ? 'Проверен ✓' : 'Возвращено' }));
  }

  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Заявки на проверку ({rows.length})</h2>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id} className="cab-card flex flex-col gap-2 text-sm">
            <p className="font-semibold">
              {row.name}
              {row.legalName && row.legalName !== row.name ? ` · ${row.legalName}` : ''}
            </p>
            <p className="text-graphite-600">
              {row.legalForm ?? '—'} · ИНН <span className="font-mono">{row.inn ?? '—'}</span> ·{' '}
              {row.taxRegime ?? 'без режима'} · {row.phone ?? 'без телефона'} · отправлено{' '}
              {new Date(row.requestedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
            </p>
            <p>
              СТС: {row.sts?.number ?? '—'}{' '}
              {row.sts?.fileUrl && (
                <a href={row.sts.fileUrl} target="_blank" className="text-signal-700 underline">
                  открыть фото
                </a>
              )}
            </p>
            {done[row.id] ? (
              <p className="font-semibold">{done[row.id]}</p>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="cab-action"
                  onClick={() => void decide(row.id, 'approve')}
                >
                  Одобрить — «Проверен»
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-slate-300 px-3"
                  onClick={() => void decide(row.id, 'reject')}
                >
                  Вернуть с причиной
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
