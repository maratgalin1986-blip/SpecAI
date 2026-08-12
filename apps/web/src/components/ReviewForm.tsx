'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@specai/ui';
import { pluralizeRu } from '@/lib/pluralize';

export function ReviewForm({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, rating, comment: comment || undefined }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(typeof body?.error === 'string' ? body.error : 'Не удалось отправить отзыв');
      return;
    }

    setSubmitted(true);
    router.refresh();
  }

  if (submitted) {
    return <p className="text-xs text-green-700">Спасибо за отзыв!</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 text-xs">
      <label className="flex items-center gap-2">
        Оценка
        <select
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="rounded border border-slate-300 px-2 py-1"
        >
          {[5, 4, 3, 2, 1].map((value) => (
            <option key={value} value={value}>
              {pluralizeRu(value, ['звезда', 'звезды', 'звёзд'])}
            </option>
          ))}
        </select>
      </label>
      <textarea
        rows={2}
        placeholder="Комментарий (необязательно)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="rounded border border-slate-300 px-2 py-1"
      />
      {error && <p className="text-red-600">{error}</p>}
      <div>
        <Button type="submit" disabled={isSubmitting} className="px-3 py-1 text-xs">
          {isSubmitting ? 'Отправка…' : 'Оставить отзыв'}
        </Button>
      </div>
    </form>
  );
}
