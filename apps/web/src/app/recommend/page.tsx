'use client';

import { useState } from 'react';
import { Button, Card } from '@specai/ui';

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

    const response = await fetch('/api/ai/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobDescription }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(typeof body?.error === 'string' ? body.error : 'Could not get a recommendation.');
      return;
    }

    const data = await response.json();
    setRecommendations(data.recommendations);
    setFollowUpQuestion(data.followUpQuestion);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">AI equipment recommendation</h1>
        <p className="mt-1 text-slate-600">
          Describe the job and get ranked equipment matches from available inventory.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          required
          rows={4}
          placeholder="e.g. Need to excavate a 200m trench for utility lines, soft soil, 2-week job."
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Thinking…' : 'Get recommendations'}
          </Button>
        </div>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {followUpQuestion && (
        <p className="text-sm text-slate-600">
          <span className="font-medium">Clarifying question: </span>
          {followUpQuestion}
        </p>
      )}

      {recommendations && recommendations.length === 0 && !error && (
        <p className="text-sm text-slate-600">No matching equipment found.</p>
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
                      {rec.equipment.category} · ${rec.equipment.dailyRate}/day
                    </p>
                  )}
                  <p className="mt-1 text-sm text-slate-600">{rec.reason}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
