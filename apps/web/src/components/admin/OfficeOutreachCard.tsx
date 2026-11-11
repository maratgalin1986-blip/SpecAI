import { Card } from '@specai/ui';
import { AdminTag } from '@/components/admin/AdminUi';
import { OfficeOutreachForm, type OfficeOutreachSettings } from './OfficeOutreachForm';

export interface OfficeOutreachCardProps {
  settings: OfficeOutreachSettings;
  /** Отправлено за московские сутки (count по emailSentAt / whatsappSentAt). */
  today: { email: number; whatsapp: number };
  /** Каналы: почта — свой ящик офиса по SMTP (lib/office/smtp.ts), WhatsApp — Green API. */
  channels: { email: boolean; whatsapp: boolean };
  /** Режим рассылки: 'auto' — офис отправляет первые письма сам, 'approve' — по кнопке владельца. */
  mode: 'auto' | 'approve';
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
export function OfficeOutreachCard({ settings, today, channels, mode }: OfficeOutreachCardProps) {
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

      <p className="rounded-xl bg-graphite-50 px-4 py-3 text-sm text-graphite-800">
        {mode === 'auto'
          ? 'Режим «сам по расписанию»: первые письма уходят без вашей кнопки, с 8 до 20 по Москве, в пределах дневного лимита. Остановить — пауза ниже; вернуть отправку по кнопке — на странице «Письма дня».'
          : 'Режим «с утверждением»: письма только готовятся и уходят по вашей кнопке «Отправить» на странице «Письма дня».'}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Counter label="Писем сегодня" value={today.email} cap={settings.dailyCap} />
        <Counter label="WhatsApp сегодня" value={today.whatsapp} cap={settings.dailyCap} />
      </div>

      <ul className="flex flex-col gap-1 text-sm">
        <li className="flex items-center gap-2">
          <AdminTag tone={channels.email ? 'green' : 'quiet'}>E-mail</AdminTag>
          <span className="text-slate-700">
            {channels.email
              ? 'подключён'
              : 'не настроен — нужны OUTREACH_SMTP_USER и OUTREACH_SMTP_PASS (ящик Яндекс 360)'}
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
