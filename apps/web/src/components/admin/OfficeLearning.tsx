import { Card } from '@specai/ui';
import { AdminTag } from '@/components/admin/AdminUi';
import { angleLeader, type AngleStat } from '@/lib/office/learning';
import { ANGLE_TITLES } from '@/lib/office/offer';

// «Чему научился офис» на /admin/office (U3, S15): по каждому заходу персонального
// предложения — сколько писем ушло, какая доля открыла превью, ответила, согласилась.
// Данные: learningTable(await collectAngleStats(prisma)) — лучший заход первым.
// Серверный компонент, без состояния.

export type LearningRow = AngleStat & { openRate: number; replyRate: number };

const percent = (rate: number, sent: number) => (sent ? `${Math.round(rate * 100)}%` : '—');

export function OfficeLearning({ rows }: { rows: readonly LearningRow[] }) {
  const leader = angleLeader(rows);
  const anySent = rows.some((r) => r.sent > 0);
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold text-graphite-950">Чему научился офис</h2>
        <p className="mt-1 text-xs text-graphite-600">
          Каждой компании письмо пишется со своим заходом — по фактам из её карточки. Офис чаще
          выбирает заход, на который лучше отвечают, но новые и отстающие тоже иногда пробует.
        </p>
      </div>
      {anySent ? (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-graphite-500">
              <tr>
                <th scope="col" className="border-b border-graphite-100 px-2 py-2 text-left">
                  Заход
                </th>
                <th scope="col" className="border-b border-graphite-100 px-2 py-2 text-right">
                  Отправлено
                </th>
                <th scope="col" className="border-b border-graphite-100 px-2 py-2 text-right">
                  Открыли
                </th>
                <th scope="col" className="border-b border-graphite-100 px-2 py-2 text-right">
                  Ответили
                </th>
                <th scope="col" className="border-b border-graphite-100 px-2 py-2 text-right">
                  Согласились
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.angle} className="border-b border-graphite-100 last:border-0">
                  <th scope="row" className="px-2 py-2 text-left font-normal">
                    <span className="font-semibold text-graphite-900">
                      {ANGLE_TITLES[row.angle]}
                    </span>
                    {leader?.angle === row.angle && (
                      <span className="ml-2 align-middle">
                        <AdminTag tone="strong">лидер</AdminTag>
                      </span>
                    )}
                  </th>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">{row.sent}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">
                    {percent(row.openRate, row.sent)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">
                    {percent(row.replyRate, row.sent)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">{row.agreed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-graphite-600">
          Писем с персональным предложением ещё не было — статистика появится после первых отправок.
        </p>
      )}
    </Card>
  );
}
