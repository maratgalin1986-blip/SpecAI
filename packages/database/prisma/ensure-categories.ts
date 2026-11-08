// Seeds the two-level tree of machinery types from packages/shared/src/categories.ts
// (owner, 2026-10-11: «вся спецтехника, как на Авито»). Runs on every build,
// before ensure-fleet, and is idempotent: rows are matched by slug, so an
// existing category keeps its id (orders and machines stay attached) while its
// name and parent are brought up to date. Parents are the groups
// (parentId = null); children point to their group.
import { CATEGORIES, CATEGORY_GROUPS } from '@specai/shared';
import { createPrismaClient } from '../src';

const prisma = createPrismaClient();

/** Prisma's "unique constraint failed" — another row already has this name. */
function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}

async function main() {
  let created = 0;
  let updated = 0;
  const skipped: string[] = [];

  const groupId = new Map<string, string>();
  for (const group of CATEGORY_GROUPS) {
    const existing = await prisma.equipmentCategory.findUnique({ where: { slug: group.slug } });
    try {
      const row = await prisma.equipmentCategory.upsert({
        where: { slug: group.slug },
        update: { name: group.name, parentId: null },
        create: { slug: group.slug, name: group.name },
      });
      groupId.set(group.slug, row.id);
      if (existing) updated += 1;
      else created += 1;
    } catch (error) {
      // A hand-made row already carries this name: leave both alone, say so.
      if (!isUniqueViolation(error)) throw error;
      skipped.push(`${group.slug} («${group.name}»)`);
    }
  }

  for (const category of CATEGORIES) {
    const parentId = groupId.get(category.group) ?? null;
    const existing = await prisma.equipmentCategory.findUnique({ where: { slug: category.slug } });
    try {
      await prisma.equipmentCategory.upsert({
        where: { slug: category.slug },
        update: { name: category.name, parentId },
        create: { slug: category.slug, name: category.name, parentId },
      });
      if (existing) updated += 1;
      else created += 1;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      skipped.push(`${category.slug} («${category.name}»)`);
    }
  }

  console.log(
    `Категории техники: групп ${CATEGORY_GROUPS.length}, видов ${CATEGORIES.length}; создано ${created}, обновлено ${updated}.`,
  );
  if (skipped.length > 0) {
    console.warn(`Пропущены из-за совпадения имени с другой строкой: ${skipped.join(', ')}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    // A preview shares its test database with every branch (see push.ts):
    // when the schema there is another branch's, the categories can wait.
    if (process.env.VERCEL_ENV !== 'preview') process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
