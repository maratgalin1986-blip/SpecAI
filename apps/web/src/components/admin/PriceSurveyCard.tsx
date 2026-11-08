import { Card } from '@specai/ui';
import { categoryName } from '@specai/shared';
import { AdminTag } from '@/components/admin/AdminUi';
import { PhoneLink } from '@/components/admin/PhoneLink';
import { rubles } from '@/lib/priceIndex';
import { personalFields, SOURCE_LABELS, type AdminPriceReport } from '@/lib/priceReports';
import { SURVEY_DAYS, type SurveyState } from '@/lib/groupPriceSurvey';

function GroupSurvey({ survey }: { survey: (SurveyState & { answersNow: number }) | null }) {
  if (!survey) {
    return (
      <p className="text-sm text-slate-600">
        Опрос в группе: бот отправит его в вашу группу с ближайшим вечерним запуском (19:00 МСК) — в
        чат «Сводка заявок сюда» или в единственный чат с ботом.
      </p>
    );
  }
  const posted = survey.postedAt ? new Date(survey.postedAt) : null;
  const ends = posted ? new Date(posted.getTime() + SURVEY_DAYS * 86_400_000) : null;
  const day = (date: Date) => date.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-slate-50 p-3 text-sm">
      <p>
        Опрос в группе «{survey.title ?? survey.chatId}»:{' '}
        {survey.status === 'closed'
          ? `закончен ${survey.closedAt ? day(new Date(survey.closedAt)) : ''}, ответов ${survey.answers ?? survey.answersNow}`
          : survey.status === 'open' && posted && ends
            ? `идёт с ${day(posted)} до ${day(ends)}, ответов пока ${survey.answersNow}${survey.pinned ? ', закреплён' : ''}`
            : 'отправляется'}
      </p>
      {survey.poll && (
        <p className="text-slate-700">
          Анонимный опрос:{' '}
          {survey.poll.options.map((option) => `${option.text} — ${option.voters}`).join(' · ')}{' '}
          (голосов: {survey.poll.total})
        </p>
      )}
    </div>
  );
}

/**
 * «Опрос цен» in /admin: the owner's database «кто по чём работает» — the
 * latest answers, the week's count and the CSV download. Name, company and
 * phone only where the person consented.
 */
export function PriceSurveyCard({
  reports,
  week,
  total,
  survey = null,
}: {
  reports: AdminPriceReport[];
  week: number;
  total: number;
  survey?: (SurveyState & { answersNow: number }) | null;
}) {
  return (
    <Card className="flex scroll-mt-24 flex-col gap-3" id="price-survey">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Опрос цен</h2>
        <p className="text-sm text-slate-600">
          за 7 дней {week} · всего {total} ·{' '}
          <a href="/api/admin/price-reports" className="font-semibold text-signal-700 underline">
            Скачать CSV
          </a>{' '}
          ·{' '}
          <a href="/ceny/opros" className="font-semibold text-signal-700 underline">
            Опрос
          </a>
        </p>
      </div>
      <GroupSurvey survey={survey} />
      {reports.length === 0 ? (
        <p className="text-sm text-slate-600">
          Ответов пока нет. Ссылка для чатов и рассылок исполнителям: /ceny/opros; в Telegram-боте —
          кнопка «💰 Цены на технику».
        </p>
      ) : (
        <ul className="flex flex-col">
          {reports.map((report) => {
            const personal = personalFields(report);
            return (
              <li
                key={report.id}
                className="flex flex-col gap-1 border-t border-slate-100 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {report.categorySlug ? categoryName(report.categorySlug) : 'вид не понят'}
                    </span>
                    {report.machineName && (
                      <span className="text-slate-700">· {report.machineName}</span>
                    )}
                    <span className="text-slate-600">· {report.city ?? 'город не указан'}</span>
                    {report.hourlyRate !== null && (
                      <span className="font-mono">{rubles(report.hourlyRate)}/ч</span>
                    )}
                    {report.shiftRate != null && (
                      <span className="font-mono">смена {rubles(report.shiftRate)}</span>
                    )}
                    {report.wantsOrders && <AdminTag tone="green">хочет заявки</AdminTag>}
                    {report.authorName && (
                      <span className="text-slate-500">· {report.authorName}</span>
                    )}
                  </p>
                  {report.rawText && (
                    <p className="break-words text-xs text-slate-500">«{report.rawText}»</p>
                  )}
                  {(personal.contactName || personal.companyName || personal.phone) && (
                    <p className="flex flex-wrap items-center gap-2 text-slate-700">
                      {[personal.contactName, personal.companyName].filter(Boolean).join(' · ')}
                      {personal.phone && <PhoneLink phone={personal.phone} />}
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-xs text-slate-500">
                  {SOURCE_LABELS[report.source] ?? report.source} ·{' '}
                  {report.createdAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
