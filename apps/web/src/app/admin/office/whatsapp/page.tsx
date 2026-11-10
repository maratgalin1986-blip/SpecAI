import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@specai/ui';
import { adminGate } from '@/components/admin/AdminGate';
import { AdminPageHeader, StatTile } from '@/components/admin/AdminUi';
import { OfficeWhatsAppList } from '@/components/admin/OfficeWhatsAppList';
import {
  emptyQueueNotes,
  manualWhatsAppQueue,
  type ManualWhatsAppQueue,
} from '@/lib/office/whatsappManual';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'WhatsApp вручную', robots: { index: false } };

/**
 * «WhatsApp вручную»: очередь фирм, у которых в карточке есть номер WhatsApp. Офис готовит
 * персональный текст со ссылкой на коммерческое предложение, владелец отправляет со своего
 * телефона. Открытие страницы ничего не отправляет.
 */
export default async function AdminOfficeWhatsAppPage() {
  const gate = await adminGate();
  if (gate) return gate;
  let queue: ManualWhatsAppQueue;
  let failed = false;
  try {
    queue = await manualWhatsAppQueue(new Date());
  } catch (error) {
    console.error('[office] whatsapp queue failed', error);
    queue = {
      items: [],
      sentToday: 0,
      dailyCap: 0,
      paused: false,
      coverage: { ready: 0, withWhatsappTag: 0, withMobile: 0, toPhone: false },
    };
    failed = true;
  }

  // Пустая очередь без причины выглядит как поломка: объясняем её счётчиками.
  const emptyNotes = failed || queue.items.length > 0 ? [] : emptyQueueNotes(queue);

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        title="WhatsApp вручную"
        text="Откройте с телефона. «Открыть WhatsApp» — чат с готовым текстом и ссылкой на предложение; нажмите «Отправить» в WhatsApp, вернитесь и отметьте «Отправил»."
      >
        <Link href="/admin/office" className="cab-action">
          Назад в офис
        </Link>
      </AdminPageHeader>

      {queue.paused && (
        <Card className="text-sm text-graphite-800">
          Рассылка на паузе: очередь не готовится. Снимите паузу в офисе.
        </Card>
      )}
      {failed && (
        <Card className="text-sm text-red-700">
          Не удалось собрать очередь — обновите страницу через минуту.
        </Card>
      )}

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="В очереди" value={queue.items.length} />
        <StatTile label="Отправлено сегодня" value={queue.sentToday} />
        <StatTile label="Лимит в день" value={queue.dailyCap} />
      </div>
      {!failed && (
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Ещё не писали" value={queue.coverage.ready} />
          <StatTile label="С пометкой WhatsApp" value={queue.coverage.withWhatsappTag} />
          <StatTile label="С мобильным номером" value={queue.coverage.withMobile} />
        </div>
      )}

      <Card>
        <OfficeWhatsAppList items={queue.items} emptyNotes={emptyNotes} />
      </Card>
    </div>
  );
}
