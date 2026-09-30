import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@specai/database';
import { agentChatRequestSchema, createOrderSchema, type AgentId } from '@specai/shared';
import { routeToAgent, runAgent, type AgentToolHandlers } from '@specai/ai-service';
import { authOptions } from '@/lib/auth';
import { formatRate } from '@/lib/money';
import { checkRateLimit } from '@/lib/rateLimit';
import { SITE } from '@/lib/site';
import { isFleetManager, OWN_FLEET } from '@/lib/fleet';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const AGENT_LIMITS_GUEST = [
  { limit: 10, windowMs: 60_000 },
  { limit: 60, windowMs: 60 * 60_000 },
];
const AGENT_LIMITS_USER = [
  { limit: 20, windowMs: 60_000 },
  { limit: 200, windowMs: 60 * 60_000 },
];

class ToolError extends Error {}

function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ToolError(`Missing required field: ${key}`);
  }
  return value;
}

function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = agentChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { messages } = parsed.data;
  if (messages.at(-1)?.role !== 'user') {
    return NextResponse.json(
      { error: 'Последнее сообщение должно быть от клиента' },
      { status: 400 },
    );
  }

  const session = await getServerSession(authOptions);
  const user = session?.user;

  // Guests can chat too, so limit by user or IP to keep AI costs bounded.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rateKey = user ? `ai:agents:user:${user.id}` : `ai:agents:ip:${ip}`;
  for (const window of user ? AGENT_LIMITS_USER : AGENT_LIMITS_GUEST) {
    const rate = checkRateLimit(`${rateKey}:${window.windowMs}`, window);
    if (!rate.ok) {
      return NextResponse.json(
        { error: `Слишком много сообщений. Попробуйте позже или позвоните: ${SITE.phone}` },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
      );
    }
  }

  function requireUser() {
    if (!user) {
      throw new ToolError('Пользователь не вошёл в аккаунт. Попросите войти на /login.');
    }
    return user;
  }

  const handlers: AgentToolHandlers = {
    async list_categories() {
      return prisma.equipmentCategory.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      });
    },

    async search_equipment(input) {
      const query = optionalString(input, 'query');
      const city = optionalString(input, 'city');
      const maxDailyRate = typeof input.maxDailyRate === 'number' ? input.maxDailyRate : undefined;
      const items = await prisma.equipment.findMany({
        where: {
          ...OWN_FLEET,
          status: input.onlyAvailable === false ? { not: 'RETIRED' } : 'AVAILABLE',
          categoryId: optionalString(input, 'categoryId'),
          dailyRate: maxDailyRate !== undefined ? { lte: maxDailyRate } : undefined,
          location: city ? { city: { contains: city, mode: 'insensitive' } } : undefined,
          OR: query
            ? [
                { name: { contains: query, mode: 'insensitive' } },
                { make: { contains: query, mode: 'insensitive' } },
                { model: { contains: query, mode: 'insensitive' } },
              ]
            : undefined,
        },
        include: { category: true, location: true },
        orderBy: { dailyRate: 'asc' },
        take: 10,
      });
      return items.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category.name,
        city: item.location?.city ?? null,
        dailyRate: Number(item.dailyRate),
        hourlyRate: item.hourlyRate ? Number(item.hourlyRate) : null,
        currency: item.currency,
        status: item.status,
        link: `/equipment/${item.id}`,
      }));
    },

    async get_equipment_details(input) {
      const item = await prisma.equipment.findUnique({
        where: { id: requireString(input, 'equipmentId') },
        include: { category: true, location: true, reviews: true },
      });
      if (!item || item.companyId !== OWN_FLEET.companyId) {
        throw new ToolError('Техника не найдена');
      }
      const ratings = item.reviews.map((r) => r.rating);
      return {
        id: item.id,
        name: item.name,
        make: item.make,
        model: item.model,
        year: item.year,
        category: item.category.name,
        status: item.status,
        city: item.location?.city ?? null,
        dailyRate: Number(item.dailyRate),
        hourlyRate: item.hourlyRate ? Number(item.hourlyRate) : null,
        weeklyRate: item.weeklyRate ? Number(item.weeklyRate) : null,
        monthlyRate: item.monthlyRate ? Number(item.monthlyRate) : null,
        currency: item.currency,
        specs: item.specs,
        description: item.description,
        averageRating: ratings.length
          ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
          : null,
        link: `/equipment/${item.id}`,
      };
    },

    async estimate_rental_cost(input) {
      const days = Number(input.days);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        throw new ToolError('days must be an integer from 1 to 365');
      }
      const item = await prisma.equipment.findUnique({
        where: { id: requireString(input, 'equipmentId') },
      });
      if (!item || item.companyId !== OWN_FLEET.companyId) {
        throw new ToolError('Техника не найдена');
      }
      const daily = Number(item.dailyRate);
      const options = [{ plan: 'посуточно', total: daily * days }];
      if (item.weeklyRate) {
        const weekly = Number(item.weeklyRate);
        options.push({
          plan: 'понедельно + посуточно',
          total: Math.floor(days / 7) * weekly + (days % 7) * daily,
        });
      }
      if (item.monthlyRate) {
        const monthly = Number(item.monthlyRate);
        options.push({ plan: 'помесячно', total: Math.ceil(days / 30) * monthly });
      }
      const best = options.reduce((a, b) => (b.total < a.total ? b : a));
      return { days, currency: item.currency, options, best };
    },

    async create_order(input) {
      const currentUser = requireUser();
      const order = createOrderSchema.safeParse({
        description: input.description,
        desiredStartDate: input.desiredStartDate,
        desiredEndDate: input.desiredEndDate,
        categoryId: optionalString(input, 'categoryId'),
      });
      if (!order.success) {
        throw new ToolError(`Некорректные данные заявки: ${order.error.message}`);
      }
      const created = await prisma.order.create({
        data: { ...order.data, customerId: currentUser.id },
      });
      return { id: created.id, status: created.status, link: `/orders/${created.id}` };
    },

    async get_my_bookings() {
      const currentUser = requireUser();
      const bookings = await prisma.booking.findMany({
        where: { customerId: currentUser.id },
        include: { equipment: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      return bookings.map((b) => ({
        id: b.id,
        equipment: b.equipment.name,
        status: b.status,
        startDate: b.startDate.toISOString().slice(0, 10),
        endDate: b.endDate.toISOString().slice(0, 10),
        totalPrice: Number(b.totalPrice),
        currency: b.currency,
        link: `/equipment/${b.equipmentId}`,
      }));
    },

    async get_my_orders() {
      const currentUser = requireUser();
      const orders = await prisma.order.findMany({
        where: { customerId: currentUser.id },
        include: { category: true, _count: { select: { bids: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      return orders.map((o) => ({
        id: o.id,
        description: o.description,
        category: o.category?.name ?? null,
        status: o.status,
        bids: o._count.bids,
        link: `/orders/${o.id}`,
      }));
    },

    async list_open_orders(input) {
      const orders = await prisma.order.findMany({
        where: { status: 'OPEN', categoryId: optionalString(input, 'categoryId') },
        include: { category: true, _count: { select: { bids: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      return orders.map((o) => ({
        id: o.id,
        description: o.description,
        category: o.category?.name ?? null,
        desiredStartDate: o.desiredStartDate.toISOString().slice(0, 10),
        desiredEndDate: o.desiredEndDate.toISOString().slice(0, 10),
        bids: o._count.bids,
        link: `/orders/${o.id}`,
      }));
    },

    async get_my_fleet() {
      const currentUser = requireUser();
      if (!isFleetManager(currentUser) || !currentUser.companyId) {
        throw new ToolError('Парк техники доступен только владельцу СпецПласт16.');
      }
      const fleet = await prisma.equipment.findMany({
        where: { companyId: currentUser.companyId },
        include: {
          category: true,
          _count: { select: { bookings: { where: { status: 'PENDING' } } } },
        },
        orderBy: { name: 'asc' },
      });
      return fleet.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category.name,
        status: item.status,
        dailyRate: Number(item.dailyRate),
        hourlyRate: item.hourlyRate ? Number(item.hourlyRate) : null,
        pendingBookings: item._count.bookings,
      }));
    },
  };

  // Without an API key (or if the AI service fails) the agents still help in
  // a simplified mode: catalog search by keywords, the user's bookings and
  // orders, and a nudge towards a callback request.
  async function offlineReply(agentId: AgentId) {
    const text = (messages.at(-1)?.content ?? '').toLowerCase();
    const lines: string[] = [];

    if (agentId === 'support' || /брон|заказ|заявк|статус/.test(text)) {
      if (user) {
        const [bookings, orders] = await Promise.all([
          handlers.get_my_bookings({}) as Promise<{ equipment: string; status: string }[]>,
          handlers.get_my_orders({}) as Promise<{ description: string; status: string }[]>,
        ]);
        if (bookings.length > 0) {
          lines.push('Ваши бронирования:');
          for (const b of bookings.slice(0, 5)) {
            lines.push(`• ${b.equipment} — ${BOOKING_STATUS_RU[b.status] ?? b.status}`);
          }
        }
        if (orders.length > 0) {
          lines.push('Ваши заявки:');
          for (const o of orders.slice(0, 5)) {
            lines.push(
              `• ${o.description.slice(0, 60)} — ${ORDER_STATUS_RU[o.status] ?? o.status}`,
            );
          }
        }
        if (lines.length > 0) lines.push('Подробности — в [личном кабинете](/dashboard).');
      } else if (agentId === 'support') {
        lines.push('Чтобы посмотреть свои бронирования и заявки, [войдите в аккаунт](/login).');
      }
    }

    if (lines.length === 0) {
      const category = OFFLINE_CATEGORIES.find(({ stem }) => text.includes(stem));
      const categories = (await handlers.list_categories({})) as { id: string; name: string }[];
      const categoryId = category
        ? categories.find((c) => c.name === category.name)?.id
        : undefined;
      const found = (await handlers.search_equipment(categoryId ? { categoryId } : {})) as {
        name: string;
        dailyRate: number;
        currency: string;
        link: string;
      }[];
      if (found.length > 0) {
        lines.push(
          category
            ? `Вот что есть по запросу «${category.name}»:`
            : 'Сейчас доступна такая техника:',
        );
        for (const item of found.slice(0, 5)) {
          lines.push(
            `• [${item.name}](${item.link}) — ${formatRate(item).price}${formatRate(item).unit}`,
          );
        }
        lines.push('[Весь каталог техники](/equipment)');
      } else {
        lines.push(
          category
            ? `${category.name} сейчас подбираем под заказ — в каталоге свободных нет.`
            : 'Подберём технику под вашу задачу.',
        );
      }
    }

    lines.push(
      '',
      `Сейчас я работаю в упрощённом режиме. Для точного подбора и цены [оставьте заявку на звонок](/contacts) или позвоните ${SITE.phone}.`,
    );
    return { agentId, reply: lines.join('\n'), toolsUsed: [], offline: true };
  }

  const fallbackAgent: AgentId =
    parsed.data.agentId === 'auto' ? 'consultant' : parsed.data.agentId;
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(await offlineReply(fallbackAgent));
  }

  try {
    const agentId =
      parsed.data.agentId === 'auto' ? await routeToAgent(messages) : parsed.data.agentId;
    const result = await runAgent(agentId, messages, handlers, {
      today: new Date().toISOString().slice(0, 10),
      userDescription: user
        ? `${user.name ?? user.email} (role ${user.role})`
        : 'not signed in (guest)',
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Agent chat failed, answering in offline mode', error);
    return NextResponse.json(await offlineReply(fallbackAgent));
  }
}

const OFFLINE_CATEGORIES = [
  { stem: 'экскаватор-погруз', name: 'Экскаваторы-погрузчики' },
  { stem: 'экскав', name: 'Экскаваторы' },
  { stem: 'кран', name: 'Краны' },
  { stem: 'бульд', name: 'Бульдозеры' },
  { stem: 'погруз', name: 'Погрузчики' },
  { stem: 'самосв', name: 'Самосвалы' },
  { stem: 'манипул', name: 'Манипуляторы' },
  { stem: 'вышк', name: 'Автовышки' },
];

const BOOKING_STATUS_RU: Record<string, string> = {
  PENDING: 'ожидает подтверждения',
  CONFIRMED: 'подтверждено',
  ACTIVE: 'в работе',
  COMPLETED: 'завершено',
  CANCELLED: 'отменено',
};

const ORDER_STATUS_RU: Record<string, string> = {
  OPEN: 'открыта',
  MATCHED: 'исполнитель выбран',
  CANCELLED: 'отменена',
};
