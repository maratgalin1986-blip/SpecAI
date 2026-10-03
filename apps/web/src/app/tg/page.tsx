import type { Metadata } from 'next';
import { MiniApp } from '@/components/miniapp/MiniApp';
import { SITE } from '@/lib/site';

// The Telegram Mini App, opened by the bot's menu button
// (app/api/admin/telegram-setup). An in-Telegram page: not for search engines.
export const metadata: Metadata = {
  title: { absolute: 'ИИСтройка в Telegram' },
  description: `Работы, техника и заказ спецтехники ${SITE.name} с машинистом прямо в Telegram.`,
  robots: { index: false, follow: false },
};

export default function TelegramMiniAppPage() {
  return <MiniApp />;
}
