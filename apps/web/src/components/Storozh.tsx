'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CONSENT_ERROR, ConsentCheck, focusFirstInvalid, PhoneInput } from '@/components/FormBits';
import { Icon } from '@/components/Icon';
import { WhatsAppIcon } from '@/components/MessengerButtons';
import { reachGoal } from '@/lib/marketing';
import { CALLBACK_IN, isOnShift, nextShiftText, SITE } from '@/lib/site';
import {
  createStorozhState,
  onMouseLeave,
  onScroll,
  onVisibilityChange,
  snoozeStorozh,
  storozhBlockedReason,
  storozhPathAllowed,
  type StorozhTrigger,
} from '@/lib/storozh';
import { phoneError } from '@/lib/phoneMask';
import { leadErrorText, submitLead } from '@/lib/submitLead';

// «Сторож»: when a visitor is about to leave without a contact, Иван from
// logistics asks one short question in a card at the bottom (never a modal,
// nothing blocks the page) and takes a phone number. The rules of WHEN live
// in lib/storozh.ts; this file only listens and draws.

/** Where the card stands on a computer (the classes below): 5.5rem from the right, 22rem wide. */
const STOROZH_CORNER = { right: 88, width: 352, height: 340 };

export function Storozh() {
  const pathname = usePathname();
  const [trigger, setTrigger] = useState<StorozhTrigger | null>(null);
  // The first page of the visit counts from its opening (this component loads
  // lazily, a moment after it); a later page from the move to it.
  const firstPage = useRef(true);

  useEffect(() => {
    const openedAt = firstPage.current ? Date.now() - performance.now() : Date.now();
    firstPage.current = false;
    if (!storozhPathAllowed(pathname)) return;
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    if (storozhBlockedReason(storage)) return;
    const state = createStorozhState(openedAt);
    const mobile = window.matchMedia('(max-width: 639px)').matches;
    // The cookie strip no longer silences Сторож (most visitors never answer
    // the strip, so they never saw him): the card stands above it (globals.css,
    // .storozh-card). On a computer the card's corner is where the callback
    // form has its consent box and «Жду звонка»: while the visitor is typing
    // there, or the form lies under that corner, Сторож keeps quiet and may
    // ask later.
    const formBusy = () => {
      if (mobile) return false;
      const forms = Array.from(document.querySelectorAll('[data-callback-form]'));
      if (forms.some((form) => form.contains(document.activeElement))) return true;
      const corner = {
        left: window.innerWidth - STOROZH_CORNER.right - STOROZH_CORNER.width,
        right: window.innerWidth - STOROZH_CORNER.right,
        top: window.innerHeight - STOROZH_CORNER.height,
        bottom: window.innerHeight,
      };
      return forms.some((form) => {
        const rect = form.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.left < corner.right &&
          rect.right > corner.left &&
          rect.top < corner.bottom &&
          rect.bottom > corner.top
        );
      });
    };
    const show = (next: StorozhTrigger | null) => {
      if (next) setTrigger(next);
    };
    const onLeave = (event: MouseEvent) => {
      if (!formBusy()) show(onMouseLeave(state, event.clientY));
    };
    const onScrolled = () => {
      show(
        onScroll(state, window.scrollY, document.documentElement.scrollHeight, window.innerHeight),
      );
    };
    const onVisibility = () => {
      show(onVisibilityChange(state, document.visibilityState === 'hidden'));
    };
    if (mobile) {
      window.addEventListener('scroll', onScrolled, { passive: true });
      document.addEventListener('visibilitychange', onVisibility);
    } else {
      document.documentElement.addEventListener('mouseleave', onLeave);
    }
    return () => {
      window.removeEventListener('scroll', onScrolled);
      document.removeEventListener('visibilitychange', onVisibility);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, [pathname]);

  if (!trigger) return null;
  return <StorozhCard trigger={trigger} onClose={() => setTrigger(null)} />;
}

function StorozhCard({ trigger, onClose }: { trigger: StorozhTrigger; onClose: () => void }) {
  const [step, setStep] = useState<'ask' | 'phone' | 'sent'>('ask');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ phone?: string; consent?: string }>({});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    reachGoal('storozh_shown');
    // The chat button and the install hint step aside (globals.css).
    document.documentElement.setAttribute('data-storozh', '');
    // Slides in (transform/opacity only); with «reduce motion» there is no
    // transition and the card simply appears.
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => {
      cancelAnimationFrame(frame);
      document.documentElement.removeAttribute('data-storozh');
    };
  }, []);

  const close = () => {
    try {
      snoozeStorozh(window.localStorage);
    } catch {
      // Quiet for this page view only.
    }
    reachGoal('storozh_close');
    onClose();
  };

  // Esc dismisses the card, the same as «Нет, спасибо».
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const problems = {
      phone: phoneError(phone) ?? undefined,
      consent: consent ? undefined : CONSENT_ERROR,
    };
    setFieldErrors(problems);
    if (problems.phone || problems.consent) {
      focusFirstInvalid(formRef.current);
      return;
    }
    setSending(true);
    try {
      await submitLead({
        phone,
        message: `Вопрос Ивана перед уходом (${trigger}): перезвонить и назвать цену`,
        source: 'storozh',
        consent,
      });
      reachGoal('storozh_lead');
      setStep('sent');
    } catch (err) {
      setError(leadErrorText(err, SITE.phone));
    } finally {
      setSending(false);
    }
  }

  const whatsapp = `${SITE.whatsappHref}?text=${encodeURIComponent(
    'Здравствуйте, Иван! Подскажите цену и свободную машину: ',
  )}`;
  const button =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold';

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="storozh-title"
      data-testid="storozh"
      data-platform-chrome
      className={`storozh-card fixed inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[46] rounded-2xl bg-slate-950 p-4 text-white shadow-2xl ring-1 ring-white/10 sm:inset-x-auto sm:bottom-6 sm:right-[5.5rem] sm:w-[22rem] sm:p-5 motion-safe:transition motion-safe:duration-300 motion-safe:ease-out ${
        entered ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <button
        type="button"
        onClick={close}
        aria-label="Закрыть"
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
      >
        <span aria-hidden className="text-lg leading-none">
          ✕
        </span>
      </button>
      {step === 'sent' ? (
        <div role="status">
          <div className="stamp w-fit" aria-hidden>
            Принято
          </div>
          <p className="mt-3 text-base font-bold">Заявка у Ивана, {SITE.name}</p>
          <p className="mt-1 text-sm text-white/70">
            {isOnShift()
              ? `Перезвонит в течение ${CALLBACK_IN}.`
              : `Сейчас нерабочее время — перезвонит ${nextShiftText()}.`}
          </p>
          <a href={SITE.phoneHref} className={`${button} mt-3 bg-amber-500 text-slate-950`}>
            <Icon name="phone" className="h-4 w-4" /> Позвонить сейчас
          </a>
        </div>
      ) : (
        <>
          <h2 id="storozh-title" className="pr-10 text-lg font-extrabold leading-tight">
            Подобрать технику и цену за минуту?
          </h2>
          <p className="mt-2 text-sm leading-snug text-white/80">
            Скажите, какая машина и на когда — перезвоню за {CALLBACK_IN} в рабочее время. Иван,
            отдел логистики {SITE.name}
          </p>
          {step === 'ask' ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStep('phone')}
                className={`${button} bg-amber-500 text-slate-950 hover:bg-amber-400`}
              >
                <Icon name="phone" className="h-4 w-4" /> Позвоните мне
              </button>
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener"
                className={`${button} bg-emerald-700 text-white hover:bg-emerald-600`}
              >
                <WhatsAppIcon className="h-4 w-4" /> WhatsApp
              </a>
              <button
                type="button"
                onClick={close}
                className={`${button} text-white/70 hover:bg-white/10 hover:text-white`}
              >
                Нет, спасибо
              </button>
            </div>
          ) : (
            <form
              ref={formRef}
              noValidate
              onSubmit={send}
              className="ym-hide-content mt-4 flex flex-col gap-2"
            >
              <PhoneInput
                autoFocus
                dark
                value={phone}
                onChange={(next) => {
                  setPhone(next);
                  if (fieldErrors.phone) setFieldErrors((now) => ({ ...now, phone: undefined }));
                }}
                error={fieldErrors.phone}
                className="min-h-11 w-full rounded-md border border-slate-600 bg-slate-900/60 px-3 py-2 text-base text-white placeholder:text-slate-400"
              />
              <ConsentCheck
                dark
                checked={consent}
                onChange={(next) => {
                  setConsent(next);
                  if (next) setFieldErrors((now) => ({ ...now, consent: undefined }));
                }}
                error={fieldErrors.consent}
              />
              {error && (
                <p role="alert" className="text-sm text-red-300">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={sending}
                className={`${button} bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-60`}
              >
                {sending ? 'Отправляем…' : 'Жду звонка'}
              </button>
            </form>
          )}
        </>
      )}
    </aside>
  );
}
