'use client';

import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '@/lib/money';
import {
  fetchPublicSupport,
  readDismissedIds,
  rememberDismissedIds,
  shouldOfferSupport,
  type PublicSupportInfo,
} from '@/lib/supportPrompt';

type EnabledSupport = Extract<PublicSupportInfo, { enabled: true }>;

export const SUPPORT_TEXT = {
  title: 'Поддержать ИИСтройка24',
  body: 'Площадка бесплатная. Если она помогла — можно поддержать её развитие любой суммой. Это добровольно.',
  custom: 'Своя сумма',
  copy: 'Скопировать номер карты',
  thanks: 'Спасибо!',
  hint: 'Перевод по номеру карты в приложении вашего банка',
  later: 'Не сейчас',
  link: 'Поддержать приложение',
} as const;

/**
 * The card itself: amount chips only help to choose (the transfer is made in
 * the person's bank app), the card number with «Скопировать», the recipient.
 */
export function SupportCard({
  support,
  onClose,
  onCopied,
  closeLabel = SUPPORT_TEXT.later,
}: {
  support: EnabledSupport;
  onClose: () => void;
  onCopied?: () => void;
  closeLabel?: string;
}) {
  const [amount, setAmount] = useState<number | 'custom' | null>(null);
  const [copied, setCopied] = useState(false);
  const digits = support.card.replace(/\D/g, '');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(digits);
    } catch {
      // No clipboard (old browser, no permission): the number stays on screen
      // and can be selected by hand.
    }
    setCopied(true);
    onCopied?.();
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-slate-700">
      <div>
        <h3 className="text-base font-semibold text-slate-900">{SUPPORT_TEXT.title}</h3>
        <p className="mt-1">{SUPPORT_TEXT.body}</p>
      </div>
      {support.amounts && support.amounts.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Сумма">
          {support.amounts.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={amount === value}
              onClick={() => setAmount(value)}
              className={`min-h-11 rounded-full border px-4 font-medium sm:min-h-9 ${
                amount === value
                  ? 'border-amber-600 bg-amber-600 text-white'
                  : 'border-slate-300 bg-white hover:border-amber-500'
              }`}
            >
              {formatMoney(value)}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={amount === 'custom'}
            onClick={() => setAmount('custom')}
            className={`min-h-11 rounded-full border px-4 font-medium sm:min-h-9 ${
              amount === 'custom'
                ? 'border-amber-600 bg-amber-600 text-white'
                : 'border-slate-300 bg-white hover:border-amber-500'
            }`}
          >
            {SUPPORT_TEXT.custom}
          </button>
        </div>
      )}
      {amount !== null && (
        <p className="text-xs text-slate-600">
          {amount === 'custom'
            ? 'Сумму вы вводите сами в приложении банка — любую.'
            : `Введите ${formatMoney(amount)} в приложении банка.`}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <span className="select-all font-mono text-lg font-semibold tracking-wide text-slate-900">
          {support.card}
        </span>
        {support.recipient && (
          <span className="text-xs text-slate-600">Получатель: {support.recipient}</span>
        )}
        <span className="text-xs text-slate-500">{SUPPORT_TEXT.hint}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="min-h-11 rounded-md bg-slate-900 px-4 font-medium text-white sm:min-h-9"
        >
          {SUPPORT_TEXT.copy}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-md px-3 text-slate-600 hover:text-slate-900 sm:min-h-9"
        >
          {closeLabel}
        </button>
        {copied && (
          <span role="status" className="font-semibold text-emerald-700">
            {SUPPORT_TEXT.thanks}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * After a completed booking (dashboard and /provider): shown once per booking
 * until «Не сейчас» or the number is copied; only when the owner turned it on.
 */
export function SupportPrompt({ completedIds }: { completedIds: string[] }) {
  const [support, setSupport] = useState<EnabledSupport | null>(null);
  // Closed for this list of bookings; a newly completed one brings it back.
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  const key = completedIds.join(',');

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (!shouldOfferSupport(true, ids, readDismissedIds())) {
      setSupport(null);
      return;
    }
    let alive = true;
    void fetchPublicSupport().then((info) => {
      if (alive && info.enabled) setSupport(info);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  if (!support || hiddenFor === key) return null;
  const close = () => {
    rememberDismissedIds(completedIds);
    setHiddenFor(key);
  };
  return (
    <SupportCard
      support={support}
      onClose={close}
      onCopied={() => rememberDismissedIds(completedIds)}
    />
  );
}

/** The quiet footer link: opens the same card any time, only when it is on. */
export function SupportFooterLink({ className }: { className?: string }) {
  const [support, setSupport] = useState<EnabledSupport | null>(null);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let alive = true;
    void fetchPublicSupport().then((info) => {
      if (alive && info.enabled) setSupport(info);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal?.();
    if (!open && element.open) element.close();
  }, [open]);

  if (!support) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {SUPPORT_TEXT.link}
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        className="w-[min(28rem,calc(100vw-2rem))] rounded-xl p-0 backdrop:bg-slate-900/50"
      >
        {open && (
          <SupportCard support={support} onClose={() => setOpen(false)} closeLabel="Закрыть" />
        )}
      </dialog>
    </>
  );
}
