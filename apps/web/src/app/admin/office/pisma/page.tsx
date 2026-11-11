import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@specai/ui';
import { adminGate } from '@/components/admin/AdminGate';
import { AdminPageHeader, StatTile } from '@/components/admin/AdminUi';
import { OfficeMailTest } from '@/components/admin/OfficeMailTest';
import { OfficeOutboxControls } from '@/components/admin/OfficeOutboxControls';
import { planOutreach, type OutreachPlan } from '@/lib/office/outreachRun';
import { readOfficeSettings } from '@/lib/office/settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const metadata: Metadata = { title: 'Письма дня', robots: { index: false } };

/**
 * «Письма дня» (К2, docs/business/sajty-pod-klyuch.md § 9.1): первые письма и напоминания на
 * сегодня в пределах дневного лимита. Владелец читает каждое, снимает лишние и отправляет
 * кнопкой; в режиме «с утверждением» (по умолчанию) крон сам писем не шлёт. Открытие страницы
 * ничего не отправляет — только готовит и записывает предложения, чтобы ушло то, что показано.
 */
export default async function AdminOfficePismaPage() {
  const gate = await adminGate();
  if (gate) return gate;
  const settings = await readOfficeSettings();
  let plan: OutreachPlan;
  let failed = false;
  try {
    plan = await planOutreach(new Date(), { settings: async () => settings });
  } catch (error) {
    console.error('[office] outbox plan failed', error);
    plan = { items: [], skipped: null };
    failed = true;
  }
  const firsts = plan.items.filter((item) => item.type === 'first').length;
  const followUps = plan.items.length - firsts;
  const noSmtp = plan.mail === 'no-smtp';

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        title="Письма дня"
        text="Здесь письма, которые офис подготовил на сегодня. В режиме «сам по расписанию» первые письма уходят без вас; в режиме «с утверждением» — только по кнопке «Отправить». Напоминания — всегда по кнопке."
      >
        <Link href="/admin/office" className="cab-action">
          Назад в офис
        </Link>
      </AdminPageHeader>

      {settings.outreachMode === 'auto' && (
        <Card className="border-amber-300 text-sm text-graphite-800">
          Включён режим «сам по расписанию» (ваше решение от 11.11.2026): первые письма уходят сами,
          с 8 до 20 по Москве, в пределах дневного лимита, без вашего просмотра. Напоминания офис
          сам не отправляет — только кнопкой ниже. Закон «О рекламе» (ч. 2 ст. 18) запрещает
          рассылку без участия человека: вернуть режим «с утверждением» — одна кнопка ниже.
        </Card>
      )}
      {settings.outreachPaused && (
        <Card className="text-sm text-graphite-800">
          Рассылка на паузе: письма не готовятся и не уходят. Снимите паузу в офисе.
        </Card>
      )}
      {noSmtp && (
        <Card className="border-red-300 text-sm text-graphite-800">
          Ящик для писем не настроен: нужны переменные OUTREACH_SMTP_USER и OUTREACH_SMTP_PASS (и
          при другом сервере — OUTREACH_SMTP_HOST, OUTREACH_SMTP_PORT) в настройках Vercel. Пока их
          нет, письма не уходят; через Resend офис не пишет.
        </Card>
      )}
      <Card>
        <OfficeMailTest />
      </Card>
      {failed && (
        <Card className="text-sm text-red-700">
          Не удалось собрать письма дня — обновите страницу через минуту.
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Первых писем" value={firsts} />
        <StatTile label="Напоминаний" value={followUps} />
        <StatTile label="Лимит в день" value={settings.dailyCap} hint="на канал" />
        <StatTile
          label="Сняты по отписке"
          value={plan.optedOut ?? 0}
          hint="их адрес попросил не писать"
        />
      </div>

      <Card>
        <OfficeOutboxControls
          items={plan.items}
          mode={settings.outreachMode}
          canSend={!settings.outreachPaused && !failed}
        />
      </Card>
    </div>
  );
}
