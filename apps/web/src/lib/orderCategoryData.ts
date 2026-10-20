import { prisma } from '@specai/database';
import { detectOrderCategorySlug } from './categorySearch';

/**
 * The machinery type an order's description names, as a category row id:
 * an order sent without a type («Любая») still reaches the providers of that
 * machinery. Only a leaf of the tree (a group holds no machines); undefined
 * when the text names none or the row is missing.
 */
export async function categoryIdFromDescription(description: string): Promise<string | undefined> {
  const slug = detectOrderCategorySlug(description);
  if (!slug) return undefined;
  const row = await prisma.equipmentCategory.findUnique({
    where: { slug },
    select: { id: true, children: { select: { id: true }, take: 1 } },
  });
  return row && row.children.length === 0 ? row.id : undefined;
}

/**
 * The category an order is saved with: the one the person chose; none when
 * they chose «Любая» by hand (`anyCategory`: open to every provider); else
 * the type the description names, if any.
 */
export async function orderCategoryId(input: {
  categoryId?: string | null;
  anyCategory?: boolean;
  description: string;
}): Promise<string | undefined> {
  if (input.categoryId) return input.categoryId;
  if (input.anyCategory) return undefined;
  return categoryIdFromDescription(input.description);
}
