import type { Metadata } from 'next';
import { prisma } from '@specai/database';
import { Card } from '@specai/ui';
import { adminGate } from '@/components/admin/AdminGate';
import { AdminPageHeader, StatTile, chipClass } from '@/components/admin/AdminUi';
import { PhoneLink } from '@/components/admin/PhoneLink';
import { LeadCrmControls } from '@/components/LeadCrmControls';
import { leadSourceLabel } from '@/lib/adminLeads';
import {
  CRM_STATUS_FILTERS,
  crmCounters,
  crmHref,
  filterCrm,
  isDueToday,
  isOverdue,
  mskDate,
  parseCrmQuery,
  sortCrm,
} from '@/lib/adminCrm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Заявки · CRM', robots: { index: false } };

type Query = Record<string, string | string[] | undefined>;

/** Leads loaded for the page; older ones are reachable through /admin/search. */
const LOADED = 500;

const when = (date: Date) =>
  date.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * The owner's CRM: every callback lead with its note, city and «перезвонить»,
 * overdue and new ones first, filters by status, today's call-backs, city and
 * the date of the enquiry (tasks/autopilot/2026-10-22-crm).
 */
export default async function AdminLeadsPage({ searchParams = {} }: { searchParams?: Query }) {
  const gate = adminGate();
  if (gate) return gate;
  const now = new Date();
  const query = parseCrmQuery(searchParams);
  // Bot drafts without a phone are not leads yet (lib/botDrafts.ts).
  const leads = await prisma.lead.findMany({
    where: { NOT: { phone: '' } },
    orderBy: { createdAt: 'desc' },
    take: LOADED,
  });
  const counters = crmCounters(leads, now);
  const shown = sortCrm(filterCrm(leads, query, now), now);
  const filtered = query.status !== 'all' || query.today || query.city || query.from || query.to;

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        title="Заявки на звонок"
        text="Кому перезвонить, о чём договорились. Новые и просроченные — сверху."
      >
        <a href="/admin/search" className={chipClass(false)}>
          Поиск по телефону
        </a>
      </AdminPageHeader>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Новые" value={counters.new} />
        <StatTile label="Перезвонить сегодня" value={counters.today} />
        <StatTile
          label="Просрочено"
          value={counters.overdue}
          tone={counters.overdue ? 'dark' : 'default'}
        />
      </div>

      <form method="get" action="/admin/leads" className="flex flex-col gap-3">
        <nav aria-label="Статус" className="flex flex-wrap gap-1.5">
          {CRM_STATUS_FILTERS.map((item) => (
            <a
              key={item.id}
              href={crmHref(query, { status: item.id })}
              aria-current={item.id === query.status ? 'page' : undefined}
              className={chipClass(item.id === query.status)}
            >
              {item.label}
            </a>
          ))}
          <a
            href={crmHref(query, { today: !query.today })}
            aria-current={query.today ? 'page' : undefined}
            className={chipClass(query.today)}
          >
            Перезвонить сегодня · {counters.today}
          </a>
        </nav>
        {query.status !== 'all' && <input type="hidden" name="status" value={query.status} />}
        {query.today && <input type="hidden" name="today" value="1" />}
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-0.5 text-xs text-graphite-600">
            Город
            <input
              name="city"
              defaultValue={query.city}
              maxLength={80}
              placeholder="Казань"
              className="rounded-md border border-slate-300 px-2 py-1 text-sm text-graphite-900"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs text-graphite-600">
            Заявки с
            <input
              type="date"
              name="from"
              defaultValue={query.from ? mskDate(query.from) : ''}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm text-graphite-900"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs text-graphite-600">
            по
            <input
              type="date"
              name="to"
              defaultValue={query.to ? mskDate(new Date(query.to.getTime() - 1)) : ''}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm text-graphite-900"
            />
          </label>
          <button type="submit" className="cab-action">
            Показать
          </button>
          {filtered && (
            <a href="/admin/leads" className="text-xs text-graphite-600 underline">
              Сбросить
            </a>
          )}
        </div>
      </form>

      <p className="text-xs text-graphite-500">
        Показано {shown.length} из {leads.length}
        {leads.length >= LOADED ? ` (загружены последние ${LOADED})` : ''}.
      </p>

      {shown.length === 0 ? (
        <Card>
          {leads.length === 0
            ? 'Заявок пока нет. Они появятся здесь, как только клиенты заполнят форму.'
            : 'По этим условиям заявок нет.'}
        </Card>
      ) : (
        shown.map((lead) => {
          const overdue = isOverdue(lead, now);
          const today = !overdue && isDueToday(lead, now);
          return (
            <Card
              key={lead.id}
              className={`flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between ${
                overdue
                  ? 'border-red-400'
                  : today || lead.status === 'NEW'
                    ? 'border-amber-300'
                    : ''
              }`}
            >
              <div className="min-w-0 lg:w-2/5">
                <div className="font-semibold">
                  {lead.name} · <PhoneLink phone={lead.phone} />
                </div>
                {lead.message && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{lead.message}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {when(lead.createdAt)}
                  {leadSourceLabel(lead.source) ? ` · ${leadSourceLabel(lead.source)}` : ''}
                </p>
                {lead.callAt && lead.status !== 'DONE' && (
                  <p
                    className={`mt-1 text-xs font-semibold ${
                      overdue ? 'text-red-700' : today ? 'text-amber-800' : 'text-graphite-700'
                    }`}
                  >
                    {overdue ? 'Просрочено: ' : 'Перезвонить: '}
                    {when(lead.callAt)}
                  </p>
                )}
              </div>
              <div className="lg:w-3/5">
                <LeadCrmControls
                  id={lead.id}
                  status={lead.status}
                  outcome={lead.outcome}
                  amount={lead.amount}
                  city={lead.city}
                  callAt={lead.callAt}
                  note={lead.note}
                />
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
