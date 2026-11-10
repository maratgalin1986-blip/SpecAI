import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { markManualWhatsAppSent } from '@/lib/office/whatsappManual';

export const dynamic = 'force-dynamic';

// «Отправил» на /admin/office/whatsapp: владелец сам отправил сообщение из своего WhatsApp,
// офис ставит отметку, чтобы фирма не попала в очередь второй раз. Ответ — без данных фирмы.
const ID = /^[\w-]{1,64}$/;

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  }
  const { id } = await props.params;
  if (!ID.test(id)) return NextResponse.json({ error: 'Кандидат не найден' }, { status: 404 });
  const marked = await markManualWhatsAppSent(id, new Date());
  if (!marked) {
    return NextResponse.json(
      { error: 'Уже отмечено или компания снята с рассылки — обновите страницу' },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
