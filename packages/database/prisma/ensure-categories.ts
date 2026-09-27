import { createPrismaClient } from '../src';

const prisma = createPrismaClient();

const BASE_CATEGORIES = [
  { name: 'Экскаваторы', slug: 'excavators' },
  { name: 'Краны', slug: 'cranes' },
  { name: 'Бульдозеры', slug: 'bulldozers' },
  { name: 'Погрузчики', slug: 'loaders' },
  { name: 'Самосвалы', slug: 'dump-trucks' },
  { name: 'Экскаваторы-погрузчики', slug: 'backhoe-loaders' },
  { name: 'Манипуляторы', slug: 'crane-trucks' },
  { name: 'Автовышки', slug: 'aerial-platforms' },
  { name: 'Тракторы', slug: 'tractors' },
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
