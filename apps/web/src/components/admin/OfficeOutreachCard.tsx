import { Card } from '@specai/ui';
import { AdminTag } from '@/components/admin/AdminUi';
import { OfficeOutreachForm, type OfficeOutreachSettings } from './OfficeOutreachForm';

export interface OfficeOutreachCardProps {
  settings: OfficeOutreachSettings;
  /** Отправлено за московские сутки (count по emailSentAt / whatsappSentAt). */
  today: { email: number; whatsapp: number };
  /** Каналы сервера (serverChannels()): есть ли ключи Resend и Green API. */
  channels: { email: boolean; whatsapp: boolean };
}

function Counter({ label, value, cap }: { label: string; value: number; cap: number }) {
  return (
    <div className="rounded-xl border border-graphite-100 bg-white px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold">
        {value}
        <span className="text-sm font-normal text-slate-500"> из {cap}</span>
      </p>
    </div>
  );
}

/**
 * Карточка «Рассылка» в /admin/office (R18, решение владельца 2026-11-09): пауза, лимит в
 * день, адрес для ответов, WhatsApp на обычный мобильный, состояние каналов и счётчики за
 * сегодня. Серверный компонент; форма внутри — клиентская (OfficeOutreachForm).
 */
export function OfficeOutreachCard({ settings, today, channels }: OfficeOutreachCardProps) {
  return (
    <Card className="flex flex-col gap-4" id="outreach">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Рассылка кандидатам</h2>
          <p className="text-sm text-slate-600">
            Каждой компании — одно письмо и/или одно сообщение WhatsApp со ссылкой на превью, только
            на контакты из открытой карточки. Ответ «стоп» снимает компанию с рассылки. Повторно —
            только вручную.
          </p>
        </div>
        <AdminTag tone={settings.outreachPaused ? 'warn' : 'strong'}>
          {settings.outreachPaused ? 'На паузе' : 'Работает'}
        </AdminTag>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Counter label="Писем сегодня" value={today.email} cap={settings.dailyCap} />
        <Counter label="WhatsApp сегодня" value={today.whatsapp} cap={settings.dailyCap} />
      </div>

      <ul className="flex flex-col gap-1 text-sm">
        <li className="flex items-center gap-2">
          <AdminTag tone={channels.email ? 'green' : 'quiet'}>E-mail</AdminTag>
          <span className="text-slate-700">
            {channels.email ? 'подключён' : 'не настроен — нужны RESEND_API_KEY и EMAIL_FROM'}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <AdminTag tone={channels.whatsapp ? 'green' : 'quiet'}>WhatsApp</AdminTag>
          <span className="text-slate-700">
            {channels.whatsapp
              ? 'подключён'
              : 'не настроен — нужны GREEN_API_INSTANCE_ID и GREEN_API_TOKEN'}
          </span>
        </li>
        <li className="text-slate-500">
          Telegram: автоматически писать нельзя, контакт показывается у кандидата для письма
          вручную.
        </li>
      </ul>

      <OfficeOutreachForm settings={settings} />

      <p className="text-xs text-slate-500">
        Рассылка предложений без согласия адресата ограничена законом «О рекламе» (ст. 18), а
        WhatsApp блокирует номера за нежелательные сообщения. Решение — за вами: офис пишет только
        на контакты компаний из открытых карточек, один раз, с отказом одним словом и журналом
        отправок.
      </p>
    </Card>
  );
}
