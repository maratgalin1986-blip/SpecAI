import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

const BASE_CATEGORIES = [
  { name: 'Экскаваторы', slug: 'excavators' },
  { name: 'Краны', slug: 'cranes' },
  { name: 'Бульдозеры', slug: 'bulldozers' },
];

async function main() {
  for (const category of BASE_CATEGORIES) {
    await prisma.equipmentCategory.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
  }
  console.log('Базовые категории техники проверены/созданы.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
