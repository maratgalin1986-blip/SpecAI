import { Card } from '@specai/ui';
import { ORDER_STATUS_LABELS } from '@specai/shared';
import { AdminTag, type TagTone } from '@/components/admin/AdminUi';
import { AiDecisionButton } from '@/components/admin/AiDecisionButton';
import type { AiDecisionRow } from '@/lib/orderModeration';

const DECISIONS: Record<string, { label: string; tone: TagTone }> = {
  PUBLISH: { label: 'Опубликовал', tone: 'green' },
  REJECT: { label: 'Отклонил', tone: 'red' },
  UNSURE: { label: 'Сомневается', tone: 'amber' },
};

/**
 * «Решения ИИ» in /admin: the last 30 verdicts of the AI moderator
 * (lib/orderModeration.ts). Nothing to do here day to day; a wrong one is
 * fixed with «Вернуть» or «Опубликовать».
 */
export function AiDecisionsCard({
  decisions,
  enabled,
}: {
  decisions: AiDecisionRow[];
  enabled: boolean;
}) {
  return (
    <Card className="flex scroll-mt-24 flex-col gap-3" id="ai-decisions">
      <div>
        <h2 className="font-semibold">Решения ИИ</h2>
        <p className="text-sm text-slate-600">
          {enabled
            ? 'Сомнительные заявки из чатов проверяет ИИ: публикует настоящие заказы техники и отклоняет рекламу, вакансии и спам. Если ИИ ошибся — нажмите «Вернуть» или «Опубликовать».'
            : 'ИИ-модератор выключен: не задан ключ ANTHROPIC_API_KEY. Сомнительные заявки ждут в списке выше.'}
        </p>
      </div>
      {decisions.length === 0 && <p className="text-sm text-slate-500">Решений пока нет.</p>}
      {decisions.map((row) => {
        const decision = DECISIONS[row.decision] ?? { label: row.decision, tone: 'graphite' };
        return (
          <div
            key={row.id}
            className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-between"
          >
            <div className="min-w-0 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <AdminTag tone={decision.tone}>{decision.label}</AdminTag>
                {row.overridden && <AdminTag tone="quiet">Изменено вручную</AdminTag>}
                <span className="text-slate-700">{row.reason}</span>
              </p>
              <p className="mt-1 break-words text-slate-600">{row.excerpt}</p>
              <p className="mt-1 text-xs text-slate-500">
                {row.moderatedAt?.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} · сейчас:{' '}
                {ORDER_STATUS_LABELS[row.status as keyof typeof ORDER_STATUS_LABELS] ?? row.status}
              </p>
            </div>
            {row.canWithdraw && <AiDecisionButton orderId={row.id} action="withdraw" />}
            {!row.canWithdraw && row.canPublish && (
              <AiDecisionButton orderId={row.id} action="publish" />
            )}
          </div>
        );
      })}
    </Card>
  );
}
