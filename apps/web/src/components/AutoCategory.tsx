'use client';

import { useEffect, useState } from 'react';
import type { SelectableCategory } from '@/components/CategorySelect';
import { detectCategoryRow } from '@/lib/categorySearch';

/**
 * The machinery type from «Что нужно» (owner, 2026-10-18): while the person
 * has not picked a type by hand, the type their description names is chosen
 * for them («Манипулятор вездеход» → «Краны-манипуляторы (КМУ)»), and cleared
 * again when the words go. A type picked by hand — «Любая» too — is never
 * changed. `pick` is the form's handler for a choice by hand; `reset` starts
 * over after the form is sent.
 */
export function useAutoCategory({
  description,
  categories,
  categoryId,
  setCategoryId,
  pickedByHand = false,
}: {
  description: string;
  categories: SelectableCategory[];
  categoryId: string;
  setCategoryId: (id: string) => void;
  /** A type that came with the page (the quick-order panel's link) counts as picked. */
  pickedByHand?: boolean;
}) {
  const [byHand, setByHand] = useState(pickedByHand);
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    if (byHand || categories.length === 0) return;
    const row = detectCategoryRow(description, categories);
    setAuto(Boolean(row));
    const next = row?.id ?? '';
    if (next !== categoryId) setCategoryId(next);
    // categoryId is read, not watched: the effect follows the words.
  }, [description, categories, byHand]);

  return {
    /** Whether the person chose the type themselves (then «Любая» means any). */
    byHand,
    /** Whether the current type was chosen from the description. */
    auto: auto && !byHand && Boolean(categoryId),
    pick(id: string) {
      setByHand(true);
      setAuto(false);
      setCategoryId(id);
    },
    reset() {
      setByHand(false);
      setAuto(false);
    },
  };
}

/**
 * «Техника: Краны-манипуляторы (КМУ) — определили по описанию · изменить»
 * under «Что нужно»; «изменить» moves to the type field.
 */
export function AutoCategoryNote({
  name,
  inputId,
  dark = false,
}: {
  name: string | undefined;
  inputId: string;
  dark?: boolean;
}) {
  if (!name) return null;
  return (
    <p
      data-auto-category
      role="status"
      className={`text-xs ${dark ? 'text-graphite-200' : 'text-slate-600'}`}
    >
      Техника: <span className="font-semibold">{name}</span> — определили по описанию ·{' '}
      <button
        type="button"
        onClick={() => document.getElementById(inputId)?.focus()}
        className="font-semibold text-amber-700 underline decoration-dotted underline-offset-2 hover:text-amber-800"
      >
        изменить
      </button>
    </p>
  );
}
