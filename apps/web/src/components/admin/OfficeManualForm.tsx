'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// «Добавить вручную» на /admin/office (R7): агент + строки
// «Название; телефон; город; почта; whatsapp» → POST /api/admin/office/manual.

type ManualResult = { created: number; skipped: number; errors: string[] };

export function OfficeManualForm({ agents }: { agents: { id: string; name: string }[] }) {
  const router = useRouter();
  const [agent, setAgent] = useState(agents[0]?.id ?? '');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ManualResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (sending || !text.trim()) return;
    setSending(true);
    setResult(null);
    setError(null);
    const response = await fetch('/api/admin/office/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent, text }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as
      (Partial<ManualResult> & { error?: string }) | null;
    setSending(false);
    if (!response?.ok || !body || typeof body.created !== 'number') {
      setError(
        typeof body?.error === 'string' ? body.error : 'Не удалось добавить — попробуйте ещё раз',
      );
      return;
    }
    setResult({
      created: body.created,
      skipped: body.skipped ?? 0,
      errors: Array.isArray(body.errors) ? body.errors : [],
    });
    if (body.created > 0) {
      setText('');
      router.refresh();
    }
  }

  return (
    <form
      className="flex flex-col gap-2 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="flex flex-col gap-0.5 text-xs text-graphite-600">
        Агент
        <select
          value={agent}
          onChange={(event) => setAgent(event.target.value)}
          className="w-fit rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-graphite-900"
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-graphite-600">
        По одной компании в строке: Название; телефон; город; почта; whatsapp (почта и WhatsApp — по
        желанию)
        <textarea
          value={text}
          rows={4}
          maxLength={20_000}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            'Стоматология Улыбка; +7 917 000-00-00; Казань; info@ulybka.ru\nСпецТехСервис; 8 (8552) 00-00-00; Набережные Челны'
          }
          className="rounded-md border border-slate-300 px-2 py-1 font-mono text-xs text-graphite-900"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={sending || !text.trim() || !agent}
          className="cab-action disabled:opacity-40"
        >
          {sending ? 'Добавляю…' : 'Добавить'}
        </button>
        {result && (
          <span className="text-xs text-graphite-700">
            Создано {result.created}, пропущено {result.skipped}
            {result.errors.length > 0 ? `, строк с ошибками: ${result.errors.length}` : ''}.
          </span>
        )}
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
      {result && result.errors.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-red-700">
          {result.errors.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
