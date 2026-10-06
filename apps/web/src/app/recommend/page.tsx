'use client';

import { useState } from 'react';
import { Button, Card } from '@specai/ui';
import { CallbackForm } from '@/components/CallbackForm';
import { SITE } from '@/lib/site';

interface Recommendation {
  equipmentId: string;
  reason: string;
  equipment?: { id: string; name: string; category: string; dailyRate: number };
}

export default function RecommendPage() {
  const [jobDescription, setJobDescription] = useState('');
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null);
  const [followUpQuestion, setFollowUpQuestion] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setRecommendations(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/ai/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobDescription }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body) {
        setError(
          typeof body?.error === 'string' ? body.error : 'Не удалось получить рекомендацию.',
        );
        return;
      }
      setRecommendations(Array.isArray(body.recommendations) ? body.recommendations : []);
      setFollowUpQuestion(body.followUpQuestion);
    } catch {
      setError('Нет связи.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">ИИ-подбор техники</h1>
        <p className="mt-1 text-slate-600">
          Опишите задачу — получите ранжированные варианты техники из доступного парка.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label htmlFor="job" className="text-sm font-medium">
          Что нужно сделать
        </label>
        <textarea
          id="job"
          required
          maxLength={2000}
          rows={4}
          placeholder="Например: нужно вырыть траншею 200 м под коммуникации, мягкий грунт, срок работ — 2 недели."
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
        <div className="flex">
          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
            {isSubmitting ? 'Подбираем…' : 'Получить рекомендации'}
          </Button>
        </div>
      </form>

      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error} Позвоните:{' '}
          <a href={SITE.phoneHref} className="font-semibold underline">
            {SITE.phone}
          </a>
        </p>
      )}

      {followUpQuestion && (
        <p className="text-sm text-slate-600">
          <span className="font-medium">Уточняющий вопрос: </span>
          {followUpQuestion}
        </p>
      )}

      {recommendations && recommendations.length === 0 && !error && (
        <p className="text-sm text-slate-600" role="status">
          Сразу подобрать не получилось — оставьте телефон, машинист подскажет.
        </p>
      )}

      {recommendations && recommendations.length > 0 && (
        <div className="flex flex-col gap-3">
          {recommendations.map((rec) => (
            <Card key={rec.equipmentId}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <a
                    href={`/equipment/${rec.equipmentId}`}
                    className="font-semibold hover:text-amber-700"
                  >
                    {rec.equipment?.name ?? rec.equipmentId}
                  </a>
                  {rec.equipment && (
                    <p className="text-sm text-slate-500">
                      {rec.equipment.category} · цена в карточке
                    </p>
                  )}
                  <p className="mt-1 text-sm text-slate-600">{rec.reason}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(recommendations !== null || error) && (
        <CallbackForm
          source="wizard"
          defaultMessage={jobDescription.slice(0, 500)}
          title="Подобрать с машинистом"
        />
      )}
    </div>
  );
}
