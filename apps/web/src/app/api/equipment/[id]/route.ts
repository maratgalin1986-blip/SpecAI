import { PUBLISHED_FLEET } from '@/lib/fleet';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma, prisma } from '@specai/database';
import { updateEquipmentSchema } from '@specai/shared';
import { getRequestUser } from '@/lib/requestUser';
import { isProvider } from '@/lib/fleet';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { listingPhoto } from '@/lib/equipmentPhoto';
import { customerRates } from '@/lib/equipmentCatalog';

export const dynamic = 'force-dynamic';

/**
 * Карточка техники (мобильное приложение). Заказчик видит только
 * опубликованный парк СпецПласт16 с ценами по прайсу; поставщик свою машину —
 * в любом статусе и с сохранёнными ценами (?mine=1, форма правки).
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getRequestUser(request);
  const mine = request.nextUrl.searchParams.get('mine') === '1';
  const owner = mine && isProvider(currentUser) ? currentUser.companyId : null;
  const own = owner
    ? await prisma.equipment.findFirst({
        where: { id: params.id, companyId: owner },
        include: {
          category: true,
          location: true,
          company: { select: { id: true, name: true } },
        },
      })
    : null;
  if (own) {
    return NextResponse.json({
      // The edit form saves imageUrls back: keep them as stored, add only the cover.
      equipment: {
        ...own,
        ...listingPhoto(own, request.nextUrl.origin),
        imageUrls: own.imageUrls,
      },
    });
  }

  // Every provider company's published machinery is public (the aggregator).
  const equipment = await prisma.equipment.findFirst({
    where: { id: params.id, ...PUBLISHED_FLEET },
    include: {
      category: true,
      location: true,
      company: { select: { id: true, name: true } },
    },
  });

  if (!equipment) {
    return NextResponse.json({ error: 'Техника не найдена' }, { status: 404 });
  }

  return NextResponse.json({
    equipment: {
      ...equipment,
      // Prices as on the site (the house fleet never below lib/prices.ts).
      ...customerRates({ ...equipment, categoryName: equipment.category.name }),
      ...listingPhoto(equipment, request.nextUrl.origin),
    },
  });
}

/**
 * Правка своей техники поставщиком (сайт и приложение): статус, цены за час и
 * смену, описание, марка/модель/год, характеристики, фото. Статус RETIRED —
 * «Снять с публикации»: машина пропадает из каталога и с карты. Менять можно
 * только технику своей компании; компания у техники не меняется.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await getRequestUser(request);
  if (!isProvider(currentUser)) {
    return NextResponse.json({ error: 'Требуется аккаунт поставщика' }, { status: 403 });
  }

  const body = await readJson(request);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  const parsed = updateEquipmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const input = parsed.data;
  if (Object.keys(input).length === 0) {
    return NextResponse.json({ error: 'Нечего сохранять' }, { status: 400 });
  }

  const existing = await prisma.equipment.findUnique({
    where: { id: params.id },
    select: { companyId: true },
  });
  // Someone else's machine looks the same as a missing one.
  if (!existing || existing.companyId !== currentUser.companyId) {
    return NextResponse.json({ error: 'Техника не найдена' }, { status: 404 });
  }

  if (input.categoryId) {
    const category = await prisma.equipmentCategory.findUnique({
      where: { id: input.categoryId },
      select: { id: true },
    });
    if (!category) {
      return NextResponse.json({ error: 'Выберите категорию из списка' }, { status: 400 });
    }
  }

  const { specs, make, model, description, ...rest } = input;
  const data: Prisma.EquipmentUncheckedUpdateInput = {
    ...rest,
    ...(make !== undefined ? { make: make || null } : {}),
    ...(model !== undefined ? { model: model || null } : {}),
    ...(description !== undefined ? { description: description?.trim() || null } : {}),
    ...(specs !== undefined
      ? {
          specs:
            specs === null || Object.keys(specs).length === 0
              ? Prisma.DbNull
              : (specs as Prisma.InputJsonValue),
        }
      : {}),
  };

  const equipment = await prisma.equipment.update({
    where: { id: params.id },
    data,
    include: { category: true, location: true, company: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ equipment, message: 'Изменения сохранены' });
}
