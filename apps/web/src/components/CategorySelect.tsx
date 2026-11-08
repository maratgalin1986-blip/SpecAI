'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { categoryEmoji, categoryGroupOf, groupCategoryRows } from '@specai/shared';
import { searchCategories } from '@/lib/categorySearch';

export interface SelectableCategory {
  id: string;
  name: string;
  /** From GET /api/categories or the database; groups the option when known. */
  slug?: string | null;
  emoji?: string | null;
}

interface Option {
  id: string;
  label: string;
  /** The group heading shown above this option while nobody types. */
  heading?: string;
  /** The group, shown beside the option in search results. */
  group?: string;
}

function optionLabel(category: SelectableCategory) {
  const emoji = category.emoji ?? categoryEmoji(category);
  return emoji ? `${emoji} ${category.name}` : category.name;
}

/**
 * The machinery type as a typeable list (owner, 2026-10-18: «он должен
 * писать, а не искать из списка»): an input with a filtered list under it.
 * Typing «манипулятор», «кму», «jcb», «вездеход» finds the type by its name,
 * group and the catalogue's keywords (lib/categorySearch.ts); without text the
 * whole tree shows by group («Землеройная техника», «Подъёмная техника», …).
 * The first option is the empty choice with the caller's wording. Arrows,
 * Enter and Escape work as in a native list; leaving the field with a typed
 * word picks the best match. `onChange` fires only on a choice by the person.
 */
export function CategorySelect({
  categories,
  value,
  onChange,
  emptyLabel,
  label,
  labelClassName = 'flex flex-col gap-1 text-sm',
  className = '',
  placeholder,
  id,
  children,
}: {
  categories: SelectableCategory[];
  value: string;
  onChange: (categoryId: string) => void;
  emptyLabel: string;
  label: ReactNode;
  labelClassName?: string;
  /** Classes of the input (border, background, padding). */
  className?: string;
  placeholder?: string;
  /** The input's id, e.g. for a «изменить» link that focuses it. */
  id?: string;
  /** Shown under the field (hints). */
  children?: ReactNode;
}) {
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const listId = `${autoId}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  // What the person typed since the field got focus; null while they have not.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const selected = categories.find((category) => category.id === value);
  const searching = Boolean(query && query.trim());

  const options = useMemo<Option[]>(() => {
    const empty: Option = { id: '', label: emptyLabel };
    if (searching) {
      return [
        empty,
        ...searchCategories(query ?? '', categories).map((category) => ({
          id: category.id,
          label: optionLabel(category),
          group: categoryGroupOf(category)?.name,
        })),
      ];
    }
    return [
      empty,
      ...groupCategoryRows(categories).flatMap(({ group, categories: rows }) =>
        rows.map((category, index) => ({
          id: category.id,
          label: optionLabel(category),
          heading: index === 0 ? group.name : undefined,
        })),
      ),
    ];
  }, [categories, emptyLabel, query, searching]);

  // The highlighted option stays in view while arrows move it.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  // A blur is handled a moment later: on a phone the tap on an option may
  // blur the input before its click arrives, and the click must win.
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ open, searching, options, active });
  latest.current = { open, searching, options, active };
  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    [],
  );

  function close() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = null;
    setOpen(false);
    setQuery(null);
  }

  function choose(option: Option | undefined) {
    close();
    // Also when it is the same type: a confirmed choice counts as made by hand.
    if (option) onChange(option.id);
  }

  function openList() {
    setOpen(true);
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.id === value),
      ),
    );
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) openList();
      else setActive((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (open) setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      // Never submits the form from here: Enter picks the highlighted type.
      if (open) {
        event.preventDefault();
        choose(options[active]);
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        close();
      }
    }
  }

  function handleBlur() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => {
      blurTimer.current = null;
      const now = latest.current;
      if (!now.open) return;
      // A typed word and a tap elsewhere («Готово» on the phone): the best match.
      if (now.searching && now.options.length > 1) {
        choose(now.options[now.active > 0 ? now.active : 1]);
        return;
      }
      close();
    }, 150);
  }

  const shown = open && query !== null ? query : selected ? optionLabel(selected) : '';

  return (
    <div className={labelClassName}>
      <label htmlFor={inputId}>{label}</label>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="done"
          value={shown}
          placeholder={placeholder ?? `${emptyLabel} — или начните вводить`}
          onFocus={(event) => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
            blurTimer.current = null;
            openList();
            event.currentTarget.select();
          }}
          onClick={() => {
            if (!open) openList();
          }}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setOpen(true);
            setActive(next.trim() ? 1 : 0);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className={`w-full pr-16 text-base sm:text-sm ${className}`}
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          {value && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Сбросить — ${emptyLabel}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose({ id: '', label: emptyLabel })}
              className="flex h-9 w-7 items-center justify-center text-lg leading-none opacity-60 hover:opacity-100"
            >
              ×
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Показать все виды техники"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (open) close();
              else inputRef.current?.focus();
            }}
            className="flex h-9 w-7 items-center justify-center text-xs opacity-60 hover:opacity-100"
          >
            ▼
          </button>
        </div>
        {open && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Виды техники"
            // Taps on the list keep the focus in the input (no blur first).
            onMouseDown={(event) => event.preventDefault()}
            className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-xl bg-white py-1 text-left text-sm text-slate-900 shadow-xl ring-1 ring-slate-200"
          >
            {options.map((option, index) => (
              <li key={option.id || 'none'} role="presentation">
                {option.heading && (
                  <div
                    aria-hidden
                    className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-500"
                  >
                    {option.heading}
                  </div>
                )}
                <div
                  id={`${listId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={option.id === value}
                  onClick={() => choose(option)}
                  onMouseMove={() => setActive(index)}
                  className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-2 ${
                    index === active ? 'bg-amber-100' : ''
                  } ${option.id === value ? 'font-semibold' : ''}`}
                >
                  <span className="min-w-0">{option.label}</span>
                  {option.group && (
                    <span className="shrink-0 text-right text-[11px] text-slate-500">
                      {option.group}
                    </span>
                  )}
                  {option.id === value && !option.group && (
                    <span aria-hidden className="shrink-0 text-amber-700">
                      ✓
                    </span>
                  )}
                </div>
              </li>
            ))}
            {searching && options.length === 1 && (
              <li role="presentation" className="px-3 py-2 text-xs text-slate-500">
                Не нашли «{query?.trim()}» — оставьте «{emptyLabel}» и опишите задачу словами,
                исполнители поймут.
              </li>
            )}
          </ul>
        )}
      </div>
      {children}
    </div>
  );
}
