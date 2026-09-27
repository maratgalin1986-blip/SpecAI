// Publishes СпецПласт16's own fleet in the catalog. Runs on every build (after
// ensure-categories) and is idempotent: rows use fixed ids and existing rows
// are never overwritten, so price or status changes made later in the provider
// cabinet stick.
import { createPrismaClient } from '../src';

const prisma = createPrismaClient();

const COMPANY_ID = 'specplast16-house';
const LOCATION_ID = 'specplast16-location';

interface FleetItem {
  id: string;
  name: string;
  make: string;
  model: string;
  categorySlug: string;
  hourlyRate: number;
  description: string;
  specs: Record<string, string | number>;
}

const FLEET: FleetItem[] = [
  {
    id: 'sp16-jcb-4cx',
    name: 'Экскаватор-погрузчик JCB 4CX',
    make: 'JCB',
    model: '4CX',
    categorySlug: 'backhoe-loaders',
    hourlyRate: 3000,
    description:
      'Экскаватор-погрузчик с оператором: траншеи, котлованы, планировка, погрузка. ' +
      'Доступен с гидромолотом для демонтажа и работы по мёрзлому грунту.',
    specs: {
      'Навесное оборудование': 'ковш, гидромолот',
      'Цена с гидромолотом, ₽/ч': 3500,
    },
  },
  {
    id: 'sp16-hidromek-102b',
    name: 'Экскаватор-погрузчик Hidromek HMK 102B',
    make: 'Hidromek',
    model: 'HMK 102B',
    categorySlug: 'backhoe-loaders',
    hourlyRate: 3000,
    description:
      'Универсальный экскаватор-погрузчик с оператором. В парке несколько машин — ' +
      'можно заказать сразу на несколько объектов.',
    specs: {
      'Навесное оборудование': 'ковш, гидромолот',
      'Цена с гидромолотом, ₽/ч': 3500,
    },
  },
  {
    id: 'sp16-lgce-b877f',
    name: 'Экскаватор-погрузчик LGCE B877F',
    make: 'LGCE',
    model: 'B877F',
    categorySlug: 'backhoe-loaders',
    hourlyRate: 3000,
    description: 'Экскаватор-погрузчик с оператором для земляных и погрузочных работ.',
    specs: {
      'Навесное оборудование': 'ковш, гидромолот',
      'Цена с гидромолотом, ₽/ч': 3500,
    },
  },
  {
    id: 'sp16-case-570',
    name: 'Экскаватор-погрузчик CASE 570',
    make: 'CASE',
    model: '570',
    categorySlug: 'backhoe-loaders',
    hourlyRate: 3000,
    description: 'Экскаватор-погрузчик с оператором: копка, засыпка, погрузка сыпучих материалов.',
    specs: { 'Навесное оборудование': 'ковш' },
  },
  {
    id: 'sp16-lonking-lg833g',
    name: 'Фронтальный погрузчик Lonking LG833G',
    make: 'Lonking',
    model: 'LG833G',
    categorySlug: 'loaders',
    hourlyRate: 3000,
    description: 'Фронтальный погрузчик с оператором: погрузка грунта, щебня, песка, уборка снега.',
    specs: { 'Навесное оборудование': 'ковш' },
  },
  {
    id: 'sp16-mtz-82',
    name: 'Трактор МТЗ «Беларус» 82.1',
    make: 'МТЗ',
    model: 'Беларус 82.1',
    categorySlug: 'tractors',
    hourlyRate: 2500,
    description: 'Колёсный трактор с оператором для вспомогательных и коммунальных работ.',
    specs: {},
  },
  {
    id: 'sp16-crane-32t',
    name: 'Автокран 32 т',
    make: '',
    model: '',
    categorySlug: 'cranes',
    hourlyRate: 4500,
    description: 'Автокран грузоподъёмностью 32 т с машинистом: монтаж, погрузка, подъём грузов.',
    specs: { 'Грузоподъёмность, т': 32 },
  },
  {
    id: 'sp16-crane-ks55716',
    name: 'Автокран КС-55716',
    make: '',
    model: 'КС-55716',
    categorySlug: 'cranes',
    hourlyRate: 3500,
    description: 'Автокран с машинистом для монтажных и погрузочно-разгрузочных работ.',
    specs: {},
  },
];

async function main() {
  await prisma.location.upsert({
    where: { id: LOCATION_ID },
    update: {},
    create: {
      id: LOCATION_ID,
      addressLine: 'Набережные Челны',
      city: 'Набережные Челны',
      region: 'Республика Татарстан',
      country: 'Россия',
    },
  });
  await prisma.company.upsert({
    where: { id: COMPANY_ID },
    update: {},
    create: {
      id: COMPANY_ID,
      name: 'ООО «СПЕЦПЛАСТ 16»',
      isProvider: true,
      taxId: '1650412557',
      description: 'Аренда спецтехники с оператором по Татарстану.',
      locationId: LOCATION_ID,
    },
  });

  const categories = await prisma.equipmentCategory.findMany({
    where: { slug: { in: [...new Set(FLEET.map((item) => item.categorySlug))] } },
  });
  const categoryId = new Map(categories.map((c) => [c.slug, c.id]));

  let created = 0;
  for (const item of FLEET) {
    const category = categoryId.get(item.categorySlug);
    if (!category) {
      console.warn(`Категория ${item.categorySlug} не найдена — пропускаю «${item.name}»`);
      continue;
    }
    const exists = await prisma.equipment.findUnique({ where: { id: item.id } });
    if (exists) continue;
    await prisma.equipment.create({
      data: {
        id: item.id,
        name: item.name,
        make: item.make || null,
        model: item.model || null,
        categoryId: category,
        companyId: COMPANY_ID,
        locationId: LOCATION_ID,
        hourlyRate: item.hourlyRate,
        // Shift price: 8 machine-hours.
        dailyRate: item.hourlyRate * 8,
        currency: 'RUB',
        description: item.description,
        specs: item.specs,
        imageUrls: [],
      },
    });
    created += 1;
  }
  console.log(`Парк СпецПласт16: добавлено ${created}, всего позиций ${FLEET.length}.`);
}

main()
  .catch((error) => {
    // Never fail the deploy because of catalog content.
    console.error('ensure-fleet failed', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
