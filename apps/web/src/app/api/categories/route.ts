import { NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import {
  CATEGORY_GROUPS,
  categoryBySlug,
  categoryGroupOf,
  categoryOrder,
  isPopularCategory,
} from '@specai/shared';

export const dynamic = 'force-dynamic';

/**
 * The machinery types a customer or a provider can pick: the leaves of the
 * category tree (groups themselves hold no machines), in the order of
 * packages/shared/src/categories.ts, each with its group and emoji so the
 * pickers can show sections and icons without the shared package (the app).
 * `categories: [{ id, name, … }]` is what the older clients read.
 */
export async function GET() {
  const rows = await prisma.equipmentCategory.findMany({
    where: { children: { none: {} } },
    select: { id: true, name: true, slug: true, parent: { select: { name: true, slug: true } } },
  });
  const categories = rows
    .map((row) => {
      const def = categoryBySlug(row.slug);
      const group = row.parent ?? categoryGroupOf(row) ?? null;
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        group: group?.name ?? null,
        groupSlug: group?.slug ?? null,
        emoji: def?.emoji ?? null,
        popular: isPopularCategory(row.slug),
        // The app finds the type from what the customer types with these
        // (apps/mobile/src/lib/categoryGroups.ts), as the site does.
        keywords: def?.keywords ?? [],
        searchWords: def?.searchWords ?? [],
        priority: def?.priority ?? 0,
      };
    })
    .sort(
      (a, b) => categoryOrder(a.slug) - categoryOrder(b.slug) || a.name.localeCompare(b.name, 'ru'),
    );
  const groups = CATEGORY_GROUPS.map((group) => ({
    slug: group.slug,
    name: group.name,
    emoji: group.emoji,
  }));
  return NextResponse.json({ categories, groups });
}
