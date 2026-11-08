import type { Metadata } from 'next';
import { adminGate } from '@/components/admin/AdminGate';
import { AdminFeedList, MarkAllReadButton } from '@/components/admin/AdminFeedList';
import { AdminPageHeader, chipClass } from '@/components/admin/AdminUi';
import { FEED_WINDOW_DAYS, parseFeedTab, splitFeed, type FeedTab } from '@/lib/adminFeed';
import { loadAdminFeed } from '@/lib/adminFeedData';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Уведомления · CRM', robots: { index: false } };

type Query = Record<string, string | string[] | undefined>;

export default async function AdminFeedPage({ searchParams }: { searchParams: Query }) {
  const gate = adminGate();
  if (gate) return gate;

  const now = new Date();
  const tab = parseFeedTab(searchParams.tab);
  const feed = await loadAdminFeed(now);
  const { unread, read } = splitFeed(feed.events, feed.readKeys);
  const shown = tab === 'unread' ? unread : tab === 'read' ? read : feed.events;

  const tabs: { id: FeedTab; label: string; count: number }[] = [
    { id: 'unread', label: 'Новые', count: unread.length },
    { id: 'read', label: 'Прочитано', count: read.length },
    { id: 'all', label: 'Все', count: feed.events.length },
  ];

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        title="Уведомления"
        text={`Что произошло на площадке за ${FEED_WINDOW_DAYS} дней: заявки, предложения, брони, модерация, новые исполнители, документы. Новое — сверху.`}
      >
        <MarkAllReadButton count={unread.length} />
      </AdminPageHeader>

      <nav aria-label="Вкладки" className="flex flex-wrap gap-1.5">
        {tabs.map((item) => (
          <a
            key={item.id}
            href={item.id === 'unread' ? '/admin/feed' : `/admin/feed?tab=${item.id}`}
            aria-current={item.id === tab ? 'page' : undefined}
            className={chipClass(item.id === tab)}
          >
            {item.label}
            <span className="font-mono tabular-nums opacity-70">{item.count}</span>
          </a>
        ))}
      </nav>

      <AdminFeedList events={shown} readKeys={[...feed.readKeys]} now={now.toISOString()} />
    </div>
  );
}
