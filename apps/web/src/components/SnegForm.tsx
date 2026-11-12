'use client';

import { useEffect, useState } from 'react';
import { ConsentText } from '@/components/ConsentText';
import { LeadSuccess } from '@/components/LeadSuccess';
import { reachGoal } from '@/lib/marketing';
import { SITE } from '@/lib/site';
import { SNEG_SOURCE, snegLeadMessage } from '@/lib/snegLead';
import { leadErrorText, readLeadDraft, submitLead } from '@/lib/submitLead';
import { useHydrated } from '@/lib/useHydrated';

const INPUT =
  'min-h-11 w-full rounded-md border border-slate-600 bg-slate-900/60 px-3 py-2 text-base text-white placeholder:text-slate-400 sm:text-sm';

// The short заявка of /uborka-snega: the phone and the consent, the address and
// what to clear if the visitor wants to say. Goes to the same POST /api/leads
// as CallbackForm, with its own source, so the dispatcher sees «Уборка снега».
export function SnegForm() {
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [what, setWhat] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();

  // A phone that did not go through last time (bad connection) comes back.
  useEffect(() => {
    const draft = readLeadDraft();
    if (draft?.phone) setPhone(draft.phone);
  }, []);

  const message = snegLeadMessage({ address, what });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus('sending');
    try {
      await submitLead({ phone, message, source: SNEG_SOURCE, consent, website });
      reachGoal('sneg_lead');
      setStatus('sent');
    } catch (err) {
      setStatus('idle');
      setError(leadErrorText(err, SITE.phone));
    }
  }

  if (status === 'sent') return <LeadSuccess dark summary={message} />;

  return (
    <form
      method="post"
      onSubmit={handleSubmit}
      data-callback-form
      data-testid="sneg-form"
      className="ym-hide-content flex flex-col gap-3"
    >
      <div>
        <h2 className="text-lg font-semibold text-white">Заявка на уборку снега</h2>
        <p className="mt-1 text-sm text-slate-300">
          Оставьте телефон — диспетчер перезвонит, уточнит объём и назовёт цену.
        </p>
      </div>
      <input
        required
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
        className={INPUT}
      />
      <input
        name="address"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        maxLength={200}
        placeholder="Город и адрес (необязательно)"
        autoComplete="street-address"
        aria-label="Город и адрес (необязательно)"
        className={INPUT}
      />
      <input
        name="what"
        value={what}
        onChange={(e) => setWhat(e.target.value)}
        maxLength={300}
        placeholder="Что убрать: двор, парковка, вывоз куч (необязательно)"
        aria-label="Что убрать (необязательно)"
        className={INPUT}
      />
      {/* Honeypot for bots — hidden from people and screen readers. */}
      <input
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="hidden"
        aria-hidden
        name="website"
      />
      <label className="flex items-start gap-2 text-xs text-slate-300">
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
        disabled={!hydrated || status === 'sending'}
        className="show-cta min-h-11 rounded-md bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-amber-600/30 transition hover:bg-amber-400 disabled:opacity-60"
      >
        {status === 'sending' ? 'Отправляем…' : 'Жду звонка'}
      </button>
    </form>
  );
}
