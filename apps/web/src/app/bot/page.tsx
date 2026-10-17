import type { Metadata } from 'next';
import { REPLY_LIMITS } from '@/lib/groupBot';
import { SITE } from '@/lib/site';

// For admins of Telegram chats about construction and machinery: what the
// group bot does (lib/groupBot.ts), why it helps the chat and how to add it.
// Linked quietly from the footer and from the bot's /about.

export const metadata: Metadata = {
  title: 'Бот для чатов о спецтехнике',
  description: `Бот ${SITE.platform} отвечает на заявки о технике в вашем Telegram-чате ссылкой, где исполнители присылают цены. Не пишет в личку и не рассылает рекламу; админ выключает его командой /quiet.`,
  alternates: { canonical: '/bot' },
};

/** «Добавить в группу»: Telegram asks which chat and opens it with the bot. */
const addLink = SITE.telegramBot ? `https://t.me/${SITE.telegramBot}?startgroup=1` : null;

const COMMANDS: [string, string][] = [
  ['/quiet', 'бот замолкает и перестаёт собирать заявки из чата'],
  ['/resume', 'включить бота снова'],
  ['/about', 'коротко, что делает бот, со ссылкой на эту страницу'],
];

export default function BotPage() {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 py-6 text-slate-700">
      <header className="flex flex-col gap-2">
        <p className="cab-eyebrow">Для админов Telegram-чатов</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Бот для чатов о спецтехнике
        </h1>
        <p>
          Бот {SITE.platform} отвечает на заявки о технике ссылкой, где исполнители присылают цены.
          Он не пишет в личку и не рассылает рекламу, а админ чата выключает его командой{' '}
          <code className="rounded bg-slate-100 px-1">/quiet</code>.
        </p>
      </header>

      <section className="cab-card flex flex-col gap-3">
        <h2 className="text-lg font-bold text-slate-900">Что делает бот</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            Видит в чате заявку вроде «нужен экскаватор завтра» и отвечает под ней одной строкой:
            ссылка, где исполнители рядом присылают свои цены.
          </li>
          <li>
            Когда придут предложения, один раз пишет под заявкой, сколько их. Больше по этой заявке
            он не пишет.
          </li>
          <li>
            Пишет только в чат и только под заявкой, без звука уведомления: не больше{' '}
            {REPLY_LIMITS.perHour} ответов в час и {REPLY_LIMITS.perDay} в день на чат. В личные
            сообщения не пишет никому, рекламу не рассылает, телефонов и имён в ответах нет.
          </li>
          <li>
            На сайте заявка публикуется без телефона и имени автора; автор может попросить её
            удалить.
          </li>
        </ul>
      </section>

      <section className="cab-card flex flex-col gap-3">
        <h2 className="text-lg font-bold text-slate-900">Зачем это чату</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            Заявки получают ответы быстрее: цены присылают исполнители, у которых техника рядом.
          </li>
          <li>Чат становится полезнее: в нём находят технику, а не теряют сообщения в ленте.</li>
          <li>Решает админ: бот работает, пока вы его не выключите.</li>
        </ul>
      </section>

      <section className="cab-card flex flex-col gap-3">
        <h2 className="text-lg font-bold text-slate-900">Как подключить</h2>
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>
            {addLink ? (
              <>
                Нажмите «Добавить бота в чат» и выберите свой чат (добавить бота может администратор
                чата).
              </>
            ) : (
              <>
                Откройте свой чат в Telegram → «Добавить участника» → найдите бота {SITE.platform}{' '}
                (добавить бота может администратор чата).
              </>
            )}
          </li>
          <li>Бот напишет в чат короткое приветствие — что он делает и как его выключить.</li>
          <li>Дальше он отвечает на заявки о технике сам. Настраивать ничего не нужно.</li>
        </ol>
        {addLink && (
          <a href={addLink} rel="noopener" className="cab-action w-fit">
            Добавить бота в чат
          </a>
        )}
        <h3 className="mt-2 font-semibold text-slate-900">Команды для админов чата</h3>
        <ul className="flex flex-col gap-1">
          {COMMANDS.map(([command, what]) => (
            <li key={command}>
              <code className="rounded bg-slate-100 px-1">{command}</code> — {what}
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-500">
          Команды выполняет только администратор чата; на сообщения других участников бот не
          отвечает.
        </p>
      </section>

      <p>
        Админам активных чатов — бонус за подключение:{' '}
        <a href="/predlozheniya" className="font-semibold text-amber-700">
          напишите нам
        </a>
        .
      </p>
      <p className="text-sm text-slate-500">
        Вопрос по боту — звоните{' '}
        <a href={SITE.phoneHref} className="font-semibold text-amber-700">
          {SITE.phone}
        </a>
        .
      </p>
    </article>
  );
}
