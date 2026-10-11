'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@specai/ui';

// «Уведомления» in the cabinet: checkboxes for Telegram, push, e-mail,
// WhatsApp and SMS (the last two «скоро» until set up on the server), linking
// Telegram through the bot and a test message. Talks to /api/notifications/*.

interface ChannelView {
  id: 'telegram' | 'push' | 'email' | 'whatsapp' | 'sms';
  label: string;
  enabled: boolean;
  available: boolean;
  active: boolean;
  soon: boolean;
  hint: string;
}

interface SettingsView {
  channels: ChannelView[];
  telegram: { linked: boolean; botConfigured: boolean };
  push: { devices: number };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Ошибка сервера');
  }
  return body as T;
}

export function NotificationSettings() {
  const [view, setView] = useState<SettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await call<SettingsView>('/api/notifications/settings'));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить настройки');
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      if (poll.current) clearInterval(poll.current);
    };
  }, [load]);

  async function toggle(channel: ChannelView) {
    setBusy(channel.id);
    setNotice(null);
    try {
      setView(
        await call<SettingsView>('/api/notifications/settings', {
          method: 'PUT',
          body: JSON.stringify({ [channel.id]: !channel.enabled }),
        }),
      );
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить');
    } finally {
      setBusy(null);
    }
  }

  async function linkTelegram() {
    setBusy('link');
    setNotice(null);
    // Opened synchronously so the browser does not block the pop-up.
    const tab = window.open('about:blank', '_blank');
    try {
      const { url } = await call<{ url: string }>('/api/notifications/telegram', {
        method: 'POST',
      });
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setNotice('В Telegram нажмите «Старт» — бот подключится в течение минуты.');
      // Watch for the bot to confirm the link (up to 3 minutes).
      let tries = 0;
      if (poll.current) clearInterval(poll.current);
      poll.current = setInterval(async () => {
        tries += 1;
        const next = await call<SettingsView>('/api/notifications/settings').catch(() => null);
        if (next) setView(next);
        if (next?.telegram.linked || tries > 60) {
          if (poll.current) clearInterval(poll.current);
          if (next?.telegram.linked) setNotice('Telegram подключён.');
        }
      }, 3000);
    } catch (caught) {
      tab?.close();
      setError(caught instanceof Error ? caught.message : 'Не удалось получить ссылку');
    } finally {
      setBusy(null);
    }
  }

  async function unlinkTelegram() {
    setBusy('unlink');
    try {
      await call('/api/notifications/telegram', { method: 'DELETE' });
      await load();
      setNotice('Telegram отвязан.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отвязать');
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy('test');
    setNotice(null);
    try {
      const result = await call<{ message: string }>('/api/notifications/test', {
        method: 'POST',
      });
      setNotice(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id="notifications" className="scroll-mt-24">
      <h2 className="mb-3 text-lg font-semibold">Уведомления</h2>
      <Card className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          Куда сообщать о новых заявках, предложениях и бронях. Telegram и push в приложении —
          бесплатно.
        </p>
        {!view && !error && <p className="text-sm text-slate-500">Загружаем…</p>}
        {view && (
          <ul className="flex flex-col gap-3">
            {view.channels.map((channel) => (
              <li key={channel.id} className="flex flex-col gap-1">
                <label
                  className={`flex items-center gap-3 ${channel.available ? '' : 'opacity-60'}`}
                >
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-amber-600"
                    checked={channel.enabled}
                    disabled={!channel.available || busy !== null}
                    onChange={() => void toggle(channel)}
                  />
                  <span className="font-medium">{channel.label}</span>
                  {channel.soon && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      скоро
                    </span>
                  )}
                  {channel.active && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                      работает
                    </span>
                  )}
                </label>
                <p className="pl-8 text-xs text-slate-500">{channel.hint}</p>
                {channel.id === 'telegram' && view.telegram.botConfigured && (
                  <div className="pl-8">
                    {view.telegram.linked ? (
                      <button
                        type="button"
                        onClick={() => void unlinkTelegram()}
                        disabled={busy !== null}
                        className="text-sm text-slate-600 underline disabled:opacity-50"
                      >
                        Отвязать Telegram
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void linkTelegram()}
                        disabled={busy !== null}
                        className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                      >
                        Подключить Telegram
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {view && (
          <div>
            <button
              type="button"
              onClick={() => void sendTest()}
              disabled={busy !== null}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Проверить уведомления
            </button>
          </div>
        )}
        {notice && <p className="text-sm text-green-800">{notice}</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </Card>
    </section>
  );
}
