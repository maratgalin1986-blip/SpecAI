import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { loadAdminStats } from '@/lib/adminStats';

export const dynamic = 'force-dynamic';

/** The owner's counters: who signed up (customers, providers), fleet, orders, moderation. */
export async function GET() {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  return NextResponse.json({ stats: await loadAdminStats() });
}
