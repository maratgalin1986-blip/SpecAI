'use client';

import { useEffect, useState } from 'react';
import { SITE } from '@/lib/site';
import { submitLead } from '@/lib/submitLead';
import { ConsentText } from '@/components/ConsentText';

const UNLOCK_KEY = 'smeta-full-unlocked';

/** Whether this visitor has opened the full estimate before (localStorage). */
export function useUnlocked(): [boolean, () => void] {
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    try {
      setUnlocked(localStorage.getItem(UNLOCK_KEY) === '1');
    } catch {
      // Storage blocked: locked until the phone is left in this visit.
    }
  }, []);
  const unlock = () => {
    try {
      localStorage.setItem(UNLOCK_KEY, '1');
    } catch {
      // Storage blocked: unlocked for this visit only.
    }
    setUnlocked(true);
  };
  return [unlocked, unlock];
}

// «Полная смета — в приложении»: an honest early-access hook. The app is not
// out yet, so we never say «скачайте»: the phone unlocks the full estimate
// right here and puts the visitor first in line for the app link.
export function SmetaUnlock({ text, onUnlocked }: { text: string; onUnlocked: () => void }) {
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus('sending');
    try {
      await submitLead({
        phone,
        consent,
        website,
        source: 'smeta-app',
        message: `Ранний доступ к приложению ${SITE.name}, открыта полная смета.\n${text}`.slice(
          0,
          1000,
        ),
      });
      onUnlocked();
    } catch (err) {
      setStatus('idle');
      setError(
        `${err instanceof Error ? err.message : 'Не удалось отправить'}. Или позвоните: ${SITE.phone}`,
      );
    }
  }

  return (
    <form
      id="smeta-unlock"
      onSubmit={submit}
      className="ym-hide-content flex scroll-mt-24 flex-col gap-3 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 sm:p-5"
    >
      <p className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.2em] text-amber-700">
        Ранний доступ
      </p>
      <h3 className="text-lg font-bold text-slate-950">
        Полная смета с этапами и 3D-моделью — откроем сразу здесь, приложение {SITE.name} скоро
      </h3>
      <p className="text-sm text-slate-700">
        Приложение готовится к выпуску: оставьте телефон — откроем полную смету прямо сейчас, а
        ссылку на приложение пришлём первым.
      </p>
      <input
        required
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        maxLength={30}
        pattern="(?:\D*\d){10,15}\D*"
        title="Номер телефона: 10–11 цифр"
        placeholder="+7 (___) ___-__-__"
        autoComplete="tel"
        inputMode="tel"
        aria-label="Телефон"
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-base"
      />
      <input
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="hidden"
        aria-hidden
        name="website"
      />
      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        <ConsentText />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={status === 'sending'}
        className="min-h-12 rounded-full bg-slate-900 px-6 font-semibold text-white disabled:opacity-60"
      >
        {status === 'sending' ? 'Открываем…' : 'Открыть полную смету'}
      </button>
    </form>
  );
}
