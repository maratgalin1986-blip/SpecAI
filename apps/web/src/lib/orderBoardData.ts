import { prisma } from '@specai/database';
import { TASK_GROUPS, taskGroupOf } from './equipmentCatalog';
import {
  BOARD_PAGE_SIZE,
  groupCategories,
  toBoardCard,
  whenWindow,
  type BoardCard,
  type BoardQuery,
  type CategoryGroup,
} from './orderBoard';
import { totalPagesFor } from './pagination';

/**
 * The open orders for the public board, from the database. Selects only what
 * the cards need; toBoardCard decides what leaves the server. Each item also
 * carries the customer's id for the page alone (its own orders get a different
 * button) — the API drops it.
 */
export interface BoardPage {
  items: { card: BoardCard; customerId: string }[];
  total: number;
  page: number;
  totalPages: number;
  groups: CategoryGroup[];
  cities: string[];
}

const EMPTY: BoardPage = { items: [], total: 0, page: 1, totalPages: 1, groups: [], cities: [] };

/** Category groups for the filters; the task groups when the tree is flat. */
export async function loadCategoryGroups(): Promise<CategoryGroup[]> {
  const rows = await prisma.equipmentCategory.findMany({
    select: { id: true, name: true, parentId: true, parent: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
  const groups = groupCategories(rows, (name) => {
    const id = taskGroupOf(name);
    return { id, label: TASK_GROUPS.find((group) => group.id === id)?.label ?? id };
  });
  // Task groups keep their own order; parent categories come alphabetically.
  const rank = new Map<string, number>(TASK_GROUPS.map((group, index) => [group.id, index]));
  return groups.sort(
    (a, b) =>
      (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99) || a.label.localeCompare(b.label, 'ru'),
  );
}

/**
 * One page of the board. Without a database the board is empty and the error
 * is logged, so the page still renders its forms and links.
 */
export async function loadOrderBoard(
  query: BoardQuery,
  options: { pageSize?: number; now?: Date } = {},
): Promise<BoardPage> {
  const pageSize = options.pageSize ?? BOARD_PAGE_SIZE;
  const now = options.now ?? new Date();
  try {
    const [groups, cityRows] = await Promise.all([
      loadCategoryGroups(),
      prisma.location.findMany({
        where: { orders: { some: { status: 'OPEN' } } },
        select: { city: true },
        distinct: ['city'],
        orderBy: { city: 'asc' },
        take: 100,
      }),
    ]);
    const group = query.group ? groups.find((item) => item.id === query.group) : undefined;
    const window = whenWindow(query.when, now);
    const where = {
      status: 'OPEN' as const,
      ...(group ? { categoryId: { in: group.categoryIds } } : {}),
      ...(query.city
        ? { location: { city: { equals: query.city, mode: 'insensitive' as const } } }
        : {}),
      ...(window.lt || window.gte ? { desiredStartDate: window } : {}),
    };
    const total = await prisma.order.count({ where });
    const totalPages = totalPagesFor(total, pageSize);
    const page = Math.min(query.page, totalPages);
    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        description: true,
        desiredStartDate: true,
        desiredEndDate: true,
        createdAt: true,
        bidsUntil: true,
        source: true,
        contactName: true,
        customerId: true,
        category: { select: { id: true, name: true } },
        customer: { select: { name: true } },
        location: { select: { city: true } },
        _count: { select: { bids: true } },
      },
      orderBy:
        query.sort === 'soonest'
          ? [{ desiredStartDate: 'asc' }, { createdAt: 'desc' }]
          : { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      items: orders.map(({ _count, customerId, ...order }) => ({
        card: toBoardCard({ ...order, bidCount: _count.bids }, now),
        customerId,
      })),
      total,
      page,
      totalPages,
      groups,
      cities: cityRows.map((row) => row.city.trim()).filter(Boolean),
    };
  } catch (error) {
    console.error('[orders/board] failed to load the board', error);
    return EMPTY;
  }
}

/** Live counters for the marketplace block: null when the database is away. */
export async function loadMarketplaceCounters(): Promise<{
  openOrders: number;
  providers: number;
  machines: number;
} | null> {
  try {
    const [openOrders, providers, machines] = await Promise.all([
      prisma.order.count({ where: { status: 'OPEN' } }),
      prisma.company.count({
        where: { isProvider: true, equipment: { some: { status: { not: 'RETIRED' } } } },
      }),
      prisma.equipment.count({
        where: { company: { isProvider: true }, status: { not: 'RETIRED' } },
      }),
    ]);
    return { openOrders, providers, machines };
  } catch (error) {
    console.error('[marketplace] failed to load the counters', error);
    return null;
  }
}
