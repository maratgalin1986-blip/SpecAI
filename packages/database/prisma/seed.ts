import bcrypt from 'bcryptjs';
import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

async function main() {
  const location = await prisma.location.create({
    data: {
      addressLine: '4400 Brighton Blvd',
      city: 'Denver',
      region: 'CO',
      postalCode: '80216',
      country: 'USA',
      latitude: 39.7803,
      longitude: -104.9764,
    },
  });

  const providerCompany = await prisma.company.create({
    data: {
      name: 'Rocky Mountain Heavy Equipment',
      isProvider: true,
      phone: '+1-303-555-0100',
      website: 'https://example.com/rmhe',
      description: 'Fleet rental provider serving the Front Range.',
      locationId: location.id,
    },
  });

  const customerCompany = await prisma.company.create({
    data: {
      name: 'Summit Construction Co.',
      isProvider: false,
      phone: '+1-303-555-0199',
    },
  });

  const [providerAdminPassword, customerPassword] = await Promise.all([
    bcrypt.hash('provider123', 10),
    bcrypt.hash('customer123', 10),
  ]);

  const providerAdmin = await prisma.user.create({
    data: {
      name: 'Pat Rivera',
      email: 'provider@example.com',
      role: 'PROVIDER_ADMIN',
      passwordHash: providerAdminPassword,
      companyId: providerCompany.id,
    },
  });

  const customer = await prisma.user.create({
    data: {
      name: 'Jordan Lee',
      email: 'customer@example.com',
      role: 'CUSTOMER',
      passwordHash: customerPassword,
      companyId: customerCompany.id,
    },
  });

  const [excavators, cranes, bulldozers] = await Promise.all([
    prisma.equipmentCategory.create({ data: { name: 'Excavators', slug: 'excavators' } }),
    prisma.equipmentCategory.create({ data: { name: 'Cranes', slug: 'cranes' } }),
    prisma.equipmentCategory.create({ data: { name: 'Bulldozers', slug: 'bulldozers' } }),
  ]);

  const excavator = await prisma.equipment.create({
    data: {
      name: 'CAT 320 Hydraulic Excavator',
      make: 'Caterpillar',
      model: '320',
      year: 2021,
      dailyRate: 650,
      weeklyRate: 3200,
      monthlyRate: 11000,
      description: 'Mid-size excavator suited for general excavation and utility work.',
      specs: {
        operatingWeightKg: 20300,
        enginePowerHp: 148,
        bucketCapacityM3: 1.19,
        maxDigDepthM: 6.5,
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
      name: 'Grove GMK4100L Mobile Crane',
      make: 'Grove',
      model: 'GMK4100L',
      year: 2019,
      dailyRate: 1800,
      weeklyRate: 9500,
      description: 'All-terrain mobile crane, 100-ton capacity.',
      specs: {
        maxLiftCapacityTons: 100,
        maxBoomLengthM: 60,
        axles: 4,
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
      name: 'CAT D6 Bulldozer',
      make: 'Caterpillar',
      model: 'D6',
      year: 2018,
      dailyRate: 900,
      description: 'Track-type tractor for grading and land clearing.',
      specs: {
        operatingWeightKg: 18500,
        enginePowerHp: 185,
        bladeCapacityM3: 3.4,
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

  console.log('Seeded database with:', {
    location: location.id,
    providerCompany: providerCompany.id,
    customerCompany: customerCompany.id,
    providerAdmin: providerAdmin.email,
    customer: customer.email,
    equipment: [excavator.id, crane.id],
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
