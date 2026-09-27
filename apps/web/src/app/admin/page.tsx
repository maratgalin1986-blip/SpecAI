import type { Metadata } from 'next';
import { prisma } from '@specai/database';
import { Card } from '@specai/ui';
import { AdminLogin, AdminLogout } from '@/components/AdminLogin';
import { LeadStatusSelect } from '@/components/LeadStatusSelect';
import { isAdminConfigured, isAdminRequest } from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Заявки на звонок', robots: { index: false } };

export default async function AdminPage() {
  if (!isAdminConfigured()) {
    return (
      <Card className="mx-auto max-w-lg">
        <h1 className="text-xl font-bold">Админка отключена</h1>
        <p className="mt-2 text-sm text-slate-600">
          Чтобы видеть заявки на звонок, задайте переменную окружения{' '}
          <code className="rounded bg-slate-100 px-1">ADMIN_PASSWORD</code> в настройках Vercel и
          сделайте Redeploy.
        </p>
      </Card>
    );
  }

  if (!isAdminRequest()) {
    return (
      <Card className="mx-auto max-w-sm">
        <h1 className="mb-4 text-xl font-bold">Вход для администратора</h1>
        <AdminLogin />
      </Card>
    );
  }

  const leads = await prisma.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  const newCount = leads.filter((lead) => lead.status === 'NEW').length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Заявки на звонок</h1>
          <p className="text-slate-600">
            Новых: <span className="font-semibold text-amber-700">{newCount}</span> · всего{' '}
            {leads.length}
          </p>
        </div>
        <AdminLogout />
      </div>

      {leads.length === 0 ? (
        <Card>Заявок пока нет. Они появятся здесь, как только клиенты заполнят форму.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {leads.map((lead) => (
            <Card
              key={lead.id}
              className={`flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between ${
                lead.status === 'NEW' ? 'border-amber-300' : ''
              }`}
            >
              <div className="min-w-0">
                <div className="font-semibold">
                  {lead.name} ·{' '}
                  <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`} className="text-amber-700">
                    {lead.phone}
                  </a>
                </div>
                {lead.message && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{lead.message}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {lead.createdAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
                  {lead.source ? ` · ${lead.source}` : ''}
                </p>
              </div>
              <LeadStatusSelect id={lead.id} status={lead.status} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
