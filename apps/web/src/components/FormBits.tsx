'use client';

import { useId, type ReactNode } from 'react';
import { ConsentText } from '@/components/ConsentText';
import { formatPhone, PHONE_PLACEHOLDER } from '@/lib/phoneMask';

// The two fields every lead form has, with the form's own words under them
// instead of the browser's bubbles (which come in the browser's language):
// the phone with the «+7 (___) ___-__-__» mask and the consent checkbox with
// a 24 px box and a 44 px row to tap.

/** The consent error; the same words the API answers with (packages/shared). */
export const CONSENT_ERROR = 'Нужно согласие на обработку персональных данных';

/** The text under a field that cannot be sent as it is. */
export function FieldError({
  id,
  dark = false,
  children,
}: {
  id?: string;
  dark?: boolean;
  children: ReactNode;
}) {
  if (!children) return null;
  return (
    <p
      id={id}
      role="alert"
      data-field-error
      className={`mt-1 text-sm ${dark ? 'text-red-300' : 'text-red-700'}`}
    >
      {children}
    </p>
  );
}

export function PhoneInput({
  value,
  onChange,
  error,
  className,
  dark = false,
  autoFocus = false,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  error?: string | null;
  /** The form's own field classes (16 px text, 44 px high). */
  className: string;
  dark?: boolean;
  autoFocus?: boolean;
  id?: string;
}) {
  const errorId = useId();
  return (
    <div className="min-w-0">
      <input
        id={id}
        type="tel"
        name="phone"
        value={value}
        onChange={(e) => onChange(formatPhone(e.target.value, value))}
        maxLength={30}
        placeholder={PHONE_PLACEHOLDER}
        autoComplete="tel"
        inputMode="tel"
        aria-label="Телефон"
        aria-required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        // Asked for by a tap («Позвоните мне»), never on page load.
        autoFocus={autoFocus}
        className={`${className} ${error ? (dark ? 'border-red-400' : 'border-red-600') : ''}`}
      />
      <FieldError id={errorId} dark={dark}>
        {error}
      </FieldError>
    </div>
  );
}

export function ConsentCheck({
  checked,
  onChange,
  error,
  dark = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  error?: string | null;
  dark?: boolean;
}) {
  const errorId = useId();
  return (
    <div>
      <label
        className={`flex min-h-11 cursor-pointer items-center gap-3 text-xs leading-snug ${
          dark ? 'text-slate-300' : 'text-slate-600'
        }`}
      >
        <input
          type="checkbox"
          name="consent"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-6 w-6 shrink-0 accent-amber-600"
        />
        <ConsentText />
      </label>
      <FieldError id={errorId} dark={dark}>
        {error}
      </FieldError>
    </div>
  );
}

/** Puts the caret into the first field marked invalid, so the error is where the eyes are. */
export function focusFirstInvalid(form: HTMLFormElement | null): void {
  // After React has painted the errors.
  requestAnimationFrame(() => {
    form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  });
}
