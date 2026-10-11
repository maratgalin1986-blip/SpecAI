'use client';

import { categoryEmoji, groupCategoryRows } from '@specai/shared';

export interface SelectableCategory {
  id: string;
  name: string;
  /** From GET /api/categories or the database; groups the option when known. */
  slug?: string | null;
  emoji?: string | null;
}

/**
 * A <select> of machinery types with one <optgroup> per group of the shared
 * category tree («Землеройная техника», «Подъёмная техника», …), in catalogue
 * order; rows outside the tree go under «Другая техника». The first option is
 * the empty choice with the caller's wording.
 */
export function CategorySelect({
  categories,
  value,
  onChange,
  emptyLabel,
  className,
  id,
  name,
  required,
}: {
  categories: SelectableCategory[];
  value: string;
  onChange: (categoryId: string) => void;
  emptyLabel: string;
  className?: string;
  id?: string;
  name?: string;
  required?: boolean;
}) {
  const groups = groupCategoryRows(categories);
  return (
    <select
      id={id}
      name={name}
      required={required}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    >
      <option value="">{emptyLabel}</option>
      {groups.map(({ group, categories: rows }) => (
        <optgroup key={group.slug} label={group.name}>
          {rows.map((category) => {
            const emoji = category.emoji ?? categoryEmoji(category);
            return (
              <option key={category.id} value={category.id}>
                {emoji ? `${emoji} ${category.name}` : category.name}
              </option>
            );
          })}
        </optgroup>
      ))}
    </select>
  );
}
