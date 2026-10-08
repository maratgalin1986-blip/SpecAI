import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/requestUser';
import { unreadMessagesTotal } from '@/lib/orderChatAccess';

export const dynamic = 'force-dynamic';

/** Unread chat messages of the current user, for the app's tab badge. */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Необходимо войти в аккаунт' }, { status: 401 });
  }
  const unread = await unreadMessagesTotal(user);
  return NextResponse.json({ unread });
}
