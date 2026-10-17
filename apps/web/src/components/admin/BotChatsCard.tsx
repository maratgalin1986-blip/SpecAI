import { Card } from '@specai/ui';
import { AdminTag } from '@/components/admin/AdminUi';
import { moscowDateKey } from '@/lib/bookingRules';
import { REPLY_LIMITS } from '@/lib/groupBot';

export interface BotChatRow {
  chatId: string;
  title: string | null;
  username: string | null;
  quiet: boolean;
  canWrite: boolean;
  removedAt: Date | null;
  repliesToday: number;
  repliesDay: string | null;
  addedAt: Date;
}

/** Replies today by Moscow day: yesterday's counter is not today's. */
export function repliesToday(
  chat: Pick<BotChatRow, 'repliesToday' | 'repliesDay'>,
  now = new Date(),
) {
  return chat.repliesDay === moscowDateKey(now) ? chat.repliesToday : 0;
}

/** «Чаты с ботом»: the groups whose admins added the Telegram bot (lib/groupBot.ts). */
export function BotChatsCard({ chats, active }: { chats: BotChatRow[]; active: number }) {
  return (
    <Card className="flex scroll-mt-24 flex-col gap-3" id="bot-chats">
      <div>
        <h2 className="font-semibold">
          Чаты с ботом <span className="text-amber-700">({active})</span>
        </h2>
        <p className="text-sm text-slate-600">
          Бот отвечает под опубликованными заявками ссылкой на торги: не больше{' '}
          {REPLY_LIMITS.perHour} ответов в час и {REPLY_LIMITS.perDay} в день на чат. Админ чата
          выключает его командой /quiet — тогда бот не отвечает и не собирает заявки.
        </p>
      </div>
      {chats.length === 0 && (
        <p className="text-sm text-slate-500">
          Бота пока не добавили ни в один чат. Страница для админов чатов — /bot.
        </p>
      )}
      {chats.map((chat) => (
        <div
          key={chat.chatId}
          className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-sm"
        >
          <span className="min-w-0 break-words font-semibold">
            {chat.title ?? `Чат ${chat.chatId}`}
          </span>
          {chat.username && <span className="text-slate-500">@{chat.username}</span>}
          {chat.removedAt ? (
            <AdminTag tone="quiet">удалён</AdminTag>
          ) : chat.quiet ? (
            <AdminTag tone="warn">выключен (/quiet)</AdminTag>
          ) : !chat.canWrite ? (
            <AdminTag tone="red">нет права писать</AdminTag>
          ) : (
            <AdminTag tone="green">отвечает</AdminTag>
          )}
          <span className="text-xs text-slate-500">
            добавлен {chat.addedAt.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })} ·
            ответов сегодня: {repliesToday(chat)}
          </span>
        </div>
      ))}
    </Card>
  );
}
