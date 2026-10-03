'use client';

import { useState } from 'react';
import { CallbackForm } from '@/components/CallbackForm';
import type { MachineType } from '@/lib/machinePhotos';
import { MACHINE_WORKS } from '@/lib/machineWorks';
import { SITE } from '@/lib/site';

export const orderHref = (machine?: MachineType | null) =>
  machine && MACHINE_WORKS[machine] ? `/?m=${machine}#podbor` : '/#podbor';

export function SmetaDisclaimer() {
  return (
    <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-200">
      Смета примерная и не является офертой. Точную цену назовёт диспетчер {SITE.name}. Все цены
      техники — с машинистом.
    </p>
  );
}

// The ways out of the estimate, СпецПласт16 first: order the machine, send
// the estimate to the dispatcher, WhatsApp.
export function SmetaCtas({
  text,
  machine,
  source,
}: {
  text: string;
  machine?: MachineType | null;
  source: string;
}) {
  const [sending, setSending] = useState(false);
  if (sending) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <CallbackForm
          source={source}
          defaultMessage={text}
          title="Отправить смету диспетчеру"
          subtitle={`Диспетчер ${SITE.name} проверит расчёт и назовёт точную цену.`}
        />
      </div>
    );
  }
  const pill = 'inline-flex min-h-12 items-center justify-center rounded-full px-6 font-semibold';
  return (
    <div className="flex flex-wrap gap-3">
      <a href={orderHref(machine)} className={`${pill} bg-slate-900 text-white hover:bg-slate-800`}>
        Заказать у {SITE.name}
      </a>
      <button
        type="button"
        onClick={() => setSending(true)}
        className={`${pill} bg-amber-500 text-slate-950 hover:bg-amber-400`}
      >
        Отправить смету диспетчеру
      </button>
      <a
        href={`${SITE.whatsappHref}?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener"
        className={`${pill} bg-emerald-700 text-white hover:bg-emerald-600`}
      >
        WhatsApp
      </a>
    </div>
  );
}
