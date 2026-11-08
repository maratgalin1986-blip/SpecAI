import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { aiModerationEnabled, loadAiDecisions } from '@/lib/orderModeration';

export const dynamic = 'force-dynamic';

// «Решения ИИ» for the app's admin menu (read-only): the last 30 verdicts of
// the AI moderator of chat orders (lib/orderModeration.ts).
export async function GET() {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const decisions = await loadAiDecisions();
  return NextResponse.json({ enabled: aiModerationEnabled(), decisions });
}
