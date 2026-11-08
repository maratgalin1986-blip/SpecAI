'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import { ConsentText } from '@/components/ConsentText';
import {
  PROPOSAL_KINDS,
  PROPOSAL_KIND_LABELS,
  PROPOSAL_SUCCESS,
  createProposalSchema,
  proposalFieldErrors,
  type ProposalFields,
  type ProposalKind,
} from '@/lib/proposals';
import { useHydrated } from '@/lib/useHydrated';

const KIND_HINTS: Record<ProposalKind, string> = {
  IDEA: 'Что сделать удобнее, чего не хватает, что мешает',
  PARTNERSHIP: 'Совместная работа, поставки, реклама, интеграции',
};

const MESSAGE_PLACEHOLDERS: Record<ProposalKind, string> = {
  IDEA: 'Например: хочу видеть на карте, сколько машина едет до объекта',
  PARTNERSHIP:
    'Кто вы, что предлагаете и чем это полезно заказчикам и исполнителям. Можно с цифрами и сроками',
};

const INPUT = 'min-h-11 w-full rounded-md border bg-white px-3 py-2 text-base sm:text-sm';

function FieldError({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <p id={id} className="mt-1 text-sm text-red-700">
      {text}
    </p>
  );
}

/** «Предложения и партнёрство»: two choices, the message, a contact for the answer. */
export function ProposalForm() {
  const { data: session } = useSession();
  const [kind, setKind] = useState<ProposalKind>('IDEA');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [fields, setFields] = useState<ProposalFields>({});
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const hydrated = useHydrated();
  const prefilled = useRef(false);
  const done = useRef<HTMLDivElement>(null);

  // Signed in: the name and the e-mail are already known; the person can change them.
  useEffect(() => {
    const user = session?.user;
    if (!user || prefilled.current) return;
    prefilled.current = true;
    if (user.name) setName((current) => current || user.name || '');
    // Technical addresses of guest orders («….invalid») cannot be answered.
    const email = user.email?.trim();
    if (email && !email.endsWith('.invalid')) setContact((current) => current || email);
  }, [session]);

  // An edited field loses its error at once.
  const clear = (field: keyof ProposalFields) =>
    setFields((current) => (current[field] ? { ...current, [field]: undefined } : current));

  useEffect(() => {
    if (status === 'sent') done.current?.focus();
  }, [status]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const payload = { kind, name, contact, company, message, consent };
    const checked = createProposalSchema.safeParse(payload);
    if (!checked.success) {
      const found = proposalFieldErrors(checked.error);
      setFields(found);
      // The first field with an error comes into view (the kind always has a value).
      const first = (['name', 'contact', 'company', 'message', 'consent'] as const).find(
        (field) => found[field],
      );
      if (first === 'consent')
        document.querySelector<HTMLInputElement>('[name="consent"]')?.focus();
      else if (first) document.getElementById(`proposal-${first}`)?.focus();
      return;
    }
    setFields({});
    setStatus('sending');
    try {
      const response = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, website }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        fields?: ProposalFields;
      } | null;
      if (!response.ok) {
        setStatus('idle');
        if (data?.fields) setFields(data.fields);
        setError(data?.error ?? 'Не удалось отправить. Попробуйте ещё раз');
        return;
      }
      setStatus('sent');
    } catch {
      setStatus('idle');
      setError('Нет связи. Проверьте интернет и отправьте ещё раз — текст сохранился');
    }
  }

  if (status === 'sent') {
    return (
      <div
        ref={done}
        tabIndex={-1}
        role="status"
        className="cab-card flex flex-col gap-2 border-emerald-300 bg-emerald-50 outline-none"
      >
        <p className="text-lg font-semibold text-emerald-800">{PROPOSAL_SUCCESS}</p>
        <p className="text-sm text-slate-700">
          Ответим по контакту, который вы оставили. Если появится что-то ещё — напишите снова.
        </p>
        <a href="/" className="cab-ghost min-h-11 self-start">
          На главную
        </a>
      </div>
    );
  }

  const describedBy = (field: keyof ProposalFields) =>
    fields[field] ? `proposal-${field}-error` : undefined;

  return (
    <form
      method="post"
      noValidate
      onSubmit={handleSubmit}
      className="ym-hide-content flex flex-col gap-4"
    >
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-900">Что вы предлагаете?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROPOSAL_KINDS.map((value) => (
            <label
              key={value}
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                kind === value
                  ? 'border-amber-500 bg-amber-50'
                  : 'border-slate-300 bg-white hover:border-slate-400'
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="mt-1"
              />
              <span>
                <span className="block font-semibold text-slate-900">
                  {PROPOSAL_KIND_LABELS[value]}
                </span>
                <span className="block text-slate-600">{KIND_HINTS[value]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="proposal-name" className="mb-1 block text-sm font-medium">
            Имя
          </label>
          <input
            id="proposal-name"
            name="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clear('name');
            }}
            maxLength={100}
            autoComplete="name"
            aria-invalid={Boolean(fields.name)}
            aria-describedby={describedBy('name')}
            className={`${INPUT} ${fields.name ? 'border-red-400' : 'border-slate-300'}`}
          />
          <FieldError id="proposal-name-error" text={fields.name} />
        </div>
        <div>
          <label htmlFor="proposal-contact" className="mb-1 block text-sm font-medium">
            Телефон или e-mail для ответа
          </label>
          <input
            id="proposal-contact"
            name="contact"
            value={contact}
            onChange={(e) => {
              setContact(e.target.value);
              clear('contact');
            }}
            maxLength={120}
            autoComplete="email"
            placeholder="+7 900 000-00-00 или mail@example.ru"
            aria-invalid={Boolean(fields.contact)}
            aria-describedby={describedBy('contact')}
            className={`${INPUT} ${fields.contact ? 'border-red-400' : 'border-slate-300'}`}
          />
          <FieldError id="proposal-contact-error" text={fields.contact} />
        </div>
      </div>

      <div>
        <label htmlFor="proposal-company" className="mb-1 block text-sm font-medium">
          Компания <span className="font-normal text-slate-500">(необязательно)</span>
        </label>
        <input
          id="proposal-company"
          name="company"
          value={company}
          onChange={(e) => {
            setCompany(e.target.value);
            clear('company');
          }}
          maxLength={200}
          autoComplete="organization"
          aria-invalid={Boolean(fields.company)}
          aria-describedby={describedBy('company')}
          className={`${INPUT} ${fields.company ? 'border-red-400' : 'border-slate-300'}`}
        />
        <FieldError id="proposal-company-error" text={fields.company} />
      </div>

      <div>
        <label htmlFor="proposal-message" className="mb-1 block text-sm font-medium">
          Расскажите подробнее
        </label>
        <textarea
          id="proposal-message"
          name="message"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            clear('message');
          }}
          maxLength={3000}
          rows={6}
          placeholder={MESSAGE_PLACEHOLDERS[kind]}
          aria-invalid={Boolean(fields.message)}
          aria-describedby={describedBy('message')}
          className={`${INPUT} ${fields.message ? 'border-red-400' : 'border-slate-300'}`}
        />
        <div className="flex justify-between gap-3">
          <FieldError id="proposal-message-error" text={fields.message} />
          <span className="ml-auto mt-1 whitespace-nowrap text-xs text-slate-500">
            {message.length} / 3000
          </span>
        </div>
      </div>

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

      <div>
        <label className="flex min-h-11 items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            name="consent"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              clear('consent');
            }}
            aria-invalid={Boolean(fields.consent)}
            aria-describedby={describedBy('consent')}
            className="mt-1 h-4 w-4 shrink-0"
          />
          <ConsentText />
        </label>
        <FieldError id="proposal-consent-error" text={fields.consent} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!hydrated || status === 'sending'}
        className="min-h-11 self-start rounded-md bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
      >
        {status === 'sending' ? 'Отправляем…' : 'Отправить'}
      </button>
    </form>
  );
}
