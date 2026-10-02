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
  {
    id: 'sp16-excavator-crawler',
    name: 'Гусеничный экскаватор',
    make: '',
    model: '',
    categorySlug: 'excavators',
    hourlyRate: 3000,
    description:
      'Гусеничный экскаватор с машинистом: котлованы, траншеи, планировка, работа на слабых грунтах.',
    specs: {},
  },
  {
    id: 'sp16-excavator-wheeled',
    name: 'Колёсный экскаватор с гидромолотом',
    make: '',
    model: '',
    categorySlug: 'excavators',
    hourlyRate: 3000,
    description:
      'Колёсный экскаватор с машинистом: земляные работы в городе, демонтаж и разбивка гидромолотом.',
    specs: { 'Навесное оборудование': 'ковш, гидромолот' },
  },
  {
    id: 'sp16-kmu-7t',
    name: 'Манипулятор КМУ 7 т',
    make: '',
    model: '',
    categorySlug: 'crane-trucks',
    hourlyRate: 3000,
    description:
      'Грузовик с краном-манипулятором и водителем: погрузка, перевозка и разгрузка грузов до 7 т.',
    specs: { 'Грузоподъёмность КМУ, т': 7 },
  },
  {
    id: 'sp16-agp',
    name: 'Автовышка АГП',
    make: '',
    model: '',
    categorySlug: 'aerial-platforms',
    hourlyRate: 2500,
    description:
      'Автогидроподъёмник с машинистом: высотные работы, фасады, кровля, освещение, спил деревьев.',
    specs: {},
  },
  {
    id: 'sp16-roller',
    name: 'Виброкаток',
    make: '',
    model: '',
    categorySlug: 'rollers',
    hourlyRate: 3000,
    description: 'Виброкаток с машинистом: уплотнение грунта, щебня и асфальта.',
    specs: {},
  },
  {
    id: 'sp16-dump-truck',
    name: 'Самосвал',
    make: '',
    model: '',
    categorySlug: 'dump-trucks',
    hourlyRate: 2300,
    description: 'Самосвал с водителем: вывоз грунта и мусора, доставка песка, щебня, ПГС.',
    specs: {},
  },
  {
    id: 'sp16-bulldozer',
    name: 'Бульдозер',
    make: '',
    model: '',
    categorySlug: 'bulldozers',
    hourlyRate: 3000,
    description:
      'Бульдозер с машинистом: планировка участка, перемещение и разравнивание грунта, засыпка.',
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
  // A point on the providers map (/map) until the owner moves it in the cabinet.
  await prisma.company.updateMany({
    where: { id: COMPANY_ID, baseLat: null },
    data: { baseLat: 55.7436, baseLon: 52.3959, baseAddress: 'Набережные Челны' },
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
