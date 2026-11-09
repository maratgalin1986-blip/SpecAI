'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ConsentText } from '@/components/ConsentText';
import { Icon } from '@/components/Icon';
import { WhatsAppIcon } from '@/components/MessengerButtons';
import { reachGoal } from '@/lib/marketing';
import { isOnShift, nextShiftText, SITE } from '@/lib/site';
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
import { leadErrorText, submitLead } from '@/lib/submitLead';

// «Сторож»: when a visitor is about to leave without a contact, Иван from
// logistics asks one short question in a card at the bottom (never a modal,
// nothing blocks the page) and takes a phone number. The rules of WHEN live
// in lib/storozh.ts; this file only listens and draws.
export function Storozh() {
  const pathname = usePathname();
  const [trigger, setTrigger] = useState<StorozhTrigger | null>(null);

  useEffect(() => {
    if (!storozhPathAllowed(pathname)) return;
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    if (storozhBlockedReason(storage)) return;
    const state = createStorozhState();
    const mobile = window.matchMedia('(max-width: 639px)').matches;
    // The cookie strip takes the same corner: Сторож waits for the answer.
    const free = () => !document.documentElement.hasAttribute('data-cookie-strip');
    const show = (next: StorozhTrigger | null) => {
      if (next) setTrigger(next);
    };
    const onLeave = (event: MouseEvent) => {
      if (free()) show(onMouseLeave(state, event.clientY));
    };
    const onScrolled = () => {
      const next = onScroll(
        state,
        window.scrollY,
        document.documentElement.scrollHeight,
        window.innerHeight,
      );
      if (next && !free()) state.fired = false;
      else show(next);
    };
    const onVisibility = () => {
      const next = onVisibilityChange(state, document.visibilityState === 'hidden');
      if (next && !free()) state.fired = false;
      else show(next);
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

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
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
      className={`fixed inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[46] rounded-2xl bg-slate-950 p-4 text-white shadow-2xl ring-1 ring-white/10 sm:inset-x-auto sm:bottom-6 sm:right-[5.5rem] sm:w-[22rem] sm:p-5 motion-safe:transition motion-safe:duration-300 motion-safe:ease-out ${
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
              ? 'Перезвонит в течение 15 минут и назовёт цену.'
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
            Скажите, какая машина и на когда — назову цену и свободную машину. Иван, отдел логистики{' '}
            {SITE.name}
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
            <form onSubmit={send} className="ym-hide-content mt-4 flex flex-col gap-2">
              <input
                required
                autoFocus
                type="tel"
                name="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={30}
                pattern="(?:\D*\d){10,15}\D*"
                title="Номер телефона: от 10 цифр"
                placeholder="+7 (___) ___-__-__"
                autoComplete="tel"
                inputMode="tel"
                aria-label="Телефон"
                className="min-h-11 w-full rounded-md border border-slate-600 bg-slate-900/60 px-3 py-2 text-base text-white placeholder:text-slate-400"
              />
              <label className="flex items-start gap-2 text-xs text-white/70">
                <input
                  type="checkbox"
                  required
                  name="consent"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <ConsentText />
              </label>
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
