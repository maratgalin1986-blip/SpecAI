'use client';

import { useEffect, useState } from 'react';
import { customerDemandText, type DemandLevel } from '@/lib/demand';

interface DemandResponse {
  categories: { categoryId: string; name: string; level: DemandLevel }[];
}

let cached: Promise<DemandResponse | null> | null = null;

function loadDemand(): Promise<DemandResponse | null> {
  cached ??= fetch('/api/demand')
    .then((res) => (res.ok ? (res.json() as Promise<DemandResponse>) : null))
    .catch(() => null);
  return cached;
}

const TONES: Record<DemandLevel, string> = {
  low: 'border-green-200 bg-green-50 text-green-800',
  medium: 'border-amber-200 bg-amber-50 text-amber-900',
  high: 'border-red-200 bg-red-50 text-red-800',
};

/**
 * The demand indicator under the machine-type field of the order forms:
 * «Сейчас много свободных экскаваторов» or «Мало — укажите дату заранее»
 * (GET /api/demand, lib/demand.ts). Nothing until a type is chosen.
 */
export function DemandHint({
  categoryId,
  categoryName,
}: {
  categoryId: string | null | undefined;
  categoryName?: string | null;
}) {
  const [data, setData] = useState<DemandResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadDemand().then((result) => !cancelled && setData(result));
    return () => {
      cancelled = true;
    };
  }, []);
  if (!categoryId || !data) return null;
  const row = data.categories.find((item) => item.categoryId === categoryId);
  const level = row?.level ?? null;
  return (
    <p
      role="status"
      className={`rounded-md border px-3 py-2 text-xs ${TONES[level ?? 'low']}`}
      data-demand={level ?? 'low'}
    >
      {customerDemandText(level, categoryName ?? row?.name)}
    </p>
  );
}
