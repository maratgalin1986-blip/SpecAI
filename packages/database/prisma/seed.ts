import bcrypt from 'bcryptjs';
import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

async function main() {
  const location = await prisma.location.create({
    data: {
      addressLine: 'ул. Титова, 27',
      city: 'Екатеринбург',
      region: 'Свердловская область',
      postalCode: '620028',
      country: 'Россия',
      latitude: 56.8389,
      longitude: 60.6057,
    },
  });

  const providerCompany = await prisma.company.create({
    data: {
      name: 'Уральская Спецтехника',
      isProvider: true,
      phone: '+7-343-555-0100',
      website: 'https://example.com/ural-spec',
      description: 'Аренда парка спецтехники по Уральскому региону.',
      locationId: location.id,
    },
  });

  const customerCompany = await prisma.company.create({
    data: {
      name: 'СтройГрупп',
      isProvider: false,
      phone: '+7-343-555-0199',
    },
  });

  const [providerAdminPassword, customerPassword] = await Promise.all([
    bcrypt.hash('provider123', 10),
    bcrypt.hash('customer123', 10),
  ]);

  const providerAdmin = await prisma.user.create({
    data: {
      name: 'Пётр Иванов',
      email: 'provider@example.com',
      role: 'PROVIDER_ADMIN',
      passwordHash: providerAdminPassword,
      companyId: providerCompany.id,
    },
  });

  const customer = await prisma.user.create({
    data: {
      name: 'Анна Смирнова',
      email: 'customer@example.com',
      role: 'CUSTOMER',
      passwordHash: customerPassword,
      companyId: customerCompany.id,
    },
  });

  const [excavators, cranes, bulldozers] = await Promise.all([
    prisma.equipmentCategory.create({ data: { name: 'Экскаваторы', slug: 'excavators' } }),
    prisma.equipmentCategory.create({ data: { name: 'Краны', slug: 'cranes' } }),
    prisma.equipmentCategory.create({ data: { name: 'Бульдозеры', slug: 'bulldozers' } }),
  ]);

  const excavator = await prisma.equipment.create({
    data: {
      name: 'Гидравлический экскаватор CAT 320',
      make: 'Caterpillar',
      model: '320',
      year: 2021,
      dailyRate: 650,
      weeklyRate: 3200,
      monthlyRate: 11000,
      description: 'Экскаватор среднего класса для земляных и инженерных работ.',
      specs: {
        'Эксплуатационная масса, кг': 20300,
        'Мощность двигателя, л.с.': 148,
        'Объём ковша, м³': 1.19,
        'Макс. глубина копания, м': 6.5,
      },
      imageUrls: [],
      status: 'AVAILABLE',
      categoryId: excavators.id,
      companyId: providerCompany.id,
      locationId: location.id,
    },
  });

  const crane = await prisma.equipment.create({
    data: {
      name: 'Автокран Grove GMK4100L',
      make: 'Grove',
      model: 'GMK4100L',
      year: 2019,
      dailyRate: 1800,
      weeklyRate: 9500,
      description: 'Полноприводный автокран грузоподъёмностью 100 тонн.',
      specs: {
        'Макс. грузоподъёмность, т': 100,
        'Макс. вылет стрелы, м': 60,
        'Количество осей': 4,
      },
      imageUrls: [],
      status: 'AVAILABLE',
      categoryId: cranes.id,
      companyId: providerCompany.id,
      locationId: location.id,
    },
  });

  await prisma.equipment.create({
    data: {
      name: 'Бульдозер CAT D6',
      make: 'Caterpillar',
      model: 'D6',
      year: 2018,
      dailyRate: 900,
      description: 'Гусеничный бульдозер для планировки и расчистки участков.',
      specs: {
        'Эксплуатационная масса, кг': 18500,
        'Мощность двигателя, л.с.': 185,
        'Объём отвала, м³': 3.4,
      },
      imageUrls: [],
      status: 'IN_MAINTENANCE',
      categoryId: bulldozers.id,
      companyId: providerCompany.id,
      locationId: location.id,
    },
  });

  await prisma.booking.create({
    data: {
      equipmentId: crane.id,
      customerId: customer.id,
      status: 'CONFIRMED',
      startDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
      totalPrice: 5400,
      deliveryLocationId: location.id,
    },
  });

  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      description: 'Нужен бульдозер для расчистки строительной площадки под фундамент, 3 дня.',
      desiredStartDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      desiredEndDate: new Date(Date.now() + 13 * 24 * 60 * 60 * 1000),
      categoryId: bulldozers.id,
    },
  });

  await prisma.bid.create({
    data: {
      orderId: order.id,
      equipmentId: excavator.id,
      price: 2100,
      currency: 'USD',
      message: 'Бульдозер сейчас на обслуживании, но этот экскаватор справится с расчисткой.',
    },
  });

  console.log('База данных заполнена демо-данными:', {
    location: location.id,
    providerCompany: providerCompany.id,
    customerCompany: customerCompany.id,
    providerAdmin: providerAdmin.email,
    customer: customer.email,
    equipment: [excavator.id, crane.id],
    order: order.id,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
