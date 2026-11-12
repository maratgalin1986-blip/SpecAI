import { NextRequest, NextResponse } from 'next/server';
import { cronAllowed } from '@/lib/cronAuth';
import { sendTestLetter } from '@/lib/office/testLetter';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

/**
 * Пробное письмо офиса владельцу (lib/office/testLetter.ts): только с секретом крона, получатель
 * задан в коде. Ответ — слово состояния и причина отказа без адресов.
 */
export async function GET(request: NextRequest) {
  if (!cronAllowed(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json(await sendTestLetter(new Date()));
}
