'use client';

import { useEffect } from 'react';

// When the site is opened from the bot's menu button (Telegram Mini App),
// Telegram passes tgWebApp* parameters in the URL hash. Only then load
// Telegram's script, expand to full height and match the header colour.
export function TelegramMiniApp() {
  useEffect(() => {
    if (!window.location.hash.includes('tgWebApp')) return;
    // /tg loads the script itself and sets its own colours.
    if (/^\/tg(\/|$)/.test(window.location.pathname)) return;
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.async = true;
    script.onload = () => {
      const app = (
        window as unknown as {
          Telegram?: {
            WebApp?: {
              ready(): void;
              expand(): void;
              setHeaderColor?(color: string): void;
            };
          };
        }
      ).Telegram?.WebApp;
      app?.ready();
      app?.expand();
      app?.setHeaderColor?.('#ffffff');
    };
    document.head.appendChild(script);
  }, []);
  return null;
}
