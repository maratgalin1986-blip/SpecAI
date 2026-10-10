import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { updateProviderDocumentSchema } from '@specai/shared';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { documentStatus } from '@/lib/documents';
import { isProvider } from '@/lib/fleet';
import { isSafeHttpUrl } from '@/lib/privacy';
import { getRequestUser } from '@/lib/requestUser';

export const dynamic = 'force-dynamic';

const FORBIDDEN = { error: 'Документы ведёт только аккаунт исполнителя' };
const NOT_FOUND = { error: 'Документ не найден' };

async function ownDocument(request: NextRequest, id: string) {
  const user = await getRequestUser(request);
  if (!isProvider(user)) return { error: NextResponse.json(FORBIDDEN, { status: 403 }) };
  const document = await prisma.providerDocument.findUnique({ where: { id } });
  if (!document || document.companyId !== user.companyId) {
    return { error: NextResponse.json(NOT_FOUND, { status: 404 }) };
  }
  return { user, document };
}

/** PATCH /api/documents/[id] — change the fields sent (a new expiry resets the reminders). */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const own = await ownDocument(request, params.id);
  if ('error' in own) return own.error;
  const body = await readJson(request);
  if (body === null) return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  const parsed = updateProviderDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (key in input) data[key] = value;
  }
  if (typeof data.equipmentId === 'string') {
    const machine = await prisma.equipment.findUnique({
      where: { id: data.equipmentId },
      select: { companyId: true },
    });
    if (!machine || machine.companyId !== own.user.companyId) {
      return NextResponse.json({ error: 'Можно прикрепить только свою технику' }, { status: 403 });
    }
  }
  if (typeof data.fileUrl === 'string' && !isSafeHttpUrl(data.fileUrl)) {
    return NextResponse.json({ error: 'Ссылка на файл должна быть https' }, { status: 400 });
  }
  if ('expiresAt' in data) {
    const changed =
      (data.expiresAt as Date | null)?.getTime() !== own.document.expiresAt?.getTime();
    if (changed) Object.assign(data, { remindedAt30: null, remindedAt0: null });
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Нечего сохранять' }, { status: 400 });
  }
  const document = await prisma.providerDocument.update({ where: { id: params.id }, data });
  return NextResponse.json({
    document: { ...document, status: documentStatus(document, new Date()) },
  });
}

/** DELETE /api/documents/[id] */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const own = await ownDocument(request, params.id);
  if ('error' in own) return own.error;
  await prisma.providerDocument.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
