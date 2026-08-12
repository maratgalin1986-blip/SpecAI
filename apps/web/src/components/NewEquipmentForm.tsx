'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@specai/ui';

interface Category {
  id: string;
  name: string;
}

export function NewEquipmentForm() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [dailyRate, setDailyRate] = useState('');
  const [description, setDescription] = useState('');
  const [specSheetText, setSpecSheetText] = useState('');
  const [specs, setSpecs] = useState<Record<string, unknown> | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []));
  }, []);

  async function handleExtractSpecs() {
    if (!specSheetText.trim()) return;
    setIsExtracting(true);
    setError(null);

    const response = await fetch('/api/ai/extract-specs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceText: specSheetText }),
    });

    setIsExtracting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(typeof body?.error === 'string' ? body.error : 'Spec extraction failed');
      return;
    }

    const data = await response.json();
    setSpecs(data.specs ?? null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch('/api/equipment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        categoryId,
        dailyRate: Number(dailyRate),
        description: description || undefined,
        specs: specs ?? undefined,
      }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(typeof body?.error === 'string' ? body.error : 'Could not create equipment listing');
      return;
    }

    setName('');
    setCategoryId('');
    setDailyRate('');
    setDescription('');
    setSpecSheetText('');
    setSpecs(null);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Category
        <select
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        >
          <option value="" disabled>
            Select a category
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Daily rate (USD)
        <input
          type="number"
          required
          min={1}
          step="0.01"
          value={dailyRate}
          onChange={(e) => setDailyRate(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Description
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <div className="rounded-md border border-dashed border-slate-300 p-3">
        <label className="flex flex-col gap-1 text-sm">
          Paste a spec sheet to auto-fill technical specs (optional)
          <textarea
            rows={3}
            value={specSheetText}
            onChange={(e) => setSpecSheetText(e.target.value)}
            placeholder="e.g. Operating weight: 20,300 kg. Engine power: 148 hp. Bucket capacity: 1.19 m3."
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          className="mt-2"
          disabled={isExtracting || !specSheetText.trim()}
          onClick={handleExtractSpecs}
        >
          {isExtracting ? 'Extracting…' : 'Extract specs with AI'}
        </Button>
        {specs && (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {Object.entries(specs).map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-slate-500">{key}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating…' : 'Add equipment'}
      </Button>
    </form>
  );
}
