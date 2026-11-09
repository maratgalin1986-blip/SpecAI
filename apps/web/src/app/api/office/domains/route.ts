import { NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import {
  DOMAIN_MAP_CACHE_SECONDS,
  DOMAIN_MAP_MAX_SITES,
  DOMAIN_MAP_WHERE,
  domainMapEntries,
} from '@/lib/office/domainMap';

export const dynamic = 'force-dynamic';

/**
 * Карта «свой домен клиента → адрес его сайта» для middleware (S7): `{ sites: [{ host, slug }] }`
 * только для опубликованных сайтов «Сайты под ключ» с подключённым доменом, оба хоста (с «www.»
 * и без). Публичный адрес только на чтение (REVIEW.md §2, список исключений): эти домены и
 * адреса /s/<slug> и так открыты всем; без имён, телефонов и id, поэтому проверять некого.
 * Кэш CDN — 5 минут, столько же карта живёт в памяти middleware (lib/office/domainMap.ts).
 */
export async function GET() {
  try {
    const rows = await prisma.prospect.findMany({
      where: DOMAIN_MAP_WHERE,
      select: { slug: true, domain: true },
      orderBy: { createdAt: 'desc' },
      take: DOMAIN_MAP_MAX_SITES,
    });
    return NextResponse.json(
      { sites: domainMapEntries(rows) },
      {
        headers: {
          'Cache-Control': `public, s-maxage=${DOMAIN_MAP_CACHE_SECONDS}, stale-while-revalidate=${DOMAIN_MAP_CACHE_SECONDS * 2}`,
        },
      },
    );
  } catch {
    // Middleware оставит прошлую карту и попробует снова (lib/office/domainMap.ts).
    return NextResponse.json(
      { error: 'Список адресов сейчас недоступен, попробуйте позже' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
