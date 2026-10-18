import { Card } from '@specai/ui';
import { AdminTag } from '@/components/admin/AdminUi';
import { ChannelPickButton } from '@/components/admin/ChannelPickButton';
import { ChatSilentButton } from '@/components/admin/ChatSilentButton';
import { moscowDateKey } from '@/lib/bookingRules';
import { REPLY_LIMITS } from '@/lib/groupBot';

export interface BotChatRow {
  chatId: string;
  title: string | null;
  username: string | null;
  quiet: boolean;
  /** «Тихий режим»: collects orders, posts nothing (null on rows from before the column). */
  silent?: boolean | null;
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
export function BotChatsCard({
  chats,
  active,
  digestChatId = null,
  digestFromEnv = false,
}: {
  chats: BotChatRow[];
  active: number;
  /** The chat picked for the daily «Заявки за сутки» post (lib/channelTarget.ts). */
  digestChatId?: string | null;
  /** TELEGRAM_CHANNEL_ID is set: it wins, the buttons are hidden. */
  digestFromEnv?: boolean;
}) {
  return (
    <Card className="flex scroll-mt-24 flex-col gap-3" id="bot-chats">
      <div>
        <h2 className="font-semibold">
          Чаты с ботом <span className="text-amber-700">({active})</span>
        </h2>
        <p className="text-sm text-slate-600">
          По умолчанию бот в «тихом режиме»: молча собирает заявки и ничего не пишет в группе — ни
          приветствия, ни ответов, ни ответов на команды. «Включить ответы» (или /otvechat от админа
          чата) — бот отвечает под опубликованными заявками ссылкой на торги, не больше{' '}
          {REPLY_LIMITS.perHour} ответов в час и {REPLY_LIMITS.perDay} в день; /tiho — снова тихо.
          Команда /quiet выключает бота совсем: не отвечает и не собирает заявки.
        </p>
        <p className="text-sm text-slate-600">
          «Сводка заявок сюда» — в этот чат (ваш канал или группу) каждый вечер в 19:00 по Москве
          бот публикует заявки за сутки. Выбирайте только свой чат.
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
          ) : chat.silent !== false ? (
            <AdminTag tone="graphite">молча собирает заявки</AdminTag>
          ) : !chat.canWrite ? (
            <AdminTag tone="red">нет права писать</AdminTag>
          ) : (
            <AdminTag tone="green">отвечает</AdminTag>
          )}
          <span className="text-xs text-slate-500">
            добавлен {chat.addedAt.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })} ·
            ответов сегодня: {repliesToday(chat)}
          </span>
          {!chat.removedAt && !chat.quiet && (
            <ChatSilentButton chatId={chat.chatId} silent={chat.silent !== false} />
          )}
          {!digestFromEnv &&
            (chat.chatId === digestChatId || (!chat.removedAt && chat.canWrite && !chat.quiet)) && (
              <ChannelPickButton
                chatId={chat.chatId}
                title={chat.title ?? `Чат ${chat.chatId}`}
                picked={chat.chatId === digestChatId}
              />
            )}
        </div>
      ))}
    </Card>
  );
}
