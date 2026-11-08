import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { getUploadMaxBytes, isAllowedUploadType, uploadTooLargeMessage } from '@/lib/blob';
import { isProvider } from '@/lib/fleet';
import { STORE_LIMITS, STORE_FULL_MESSAGE } from '@/lib/fileStore';
import { checkRateLimit } from '@/lib/rateLimit';
import { getRequestUser } from '@/lib/requestUser';
import { privateVerificationKey } from '@/lib/privateFiles';

export const dynamic = 'force-dynamic';

/**
 * POST multipart {file} — фото или PDF СТС для проверки. Хранится в базе как
 * закрытый файл компании (lib/privateFiles.ts), никогда в публичном Blob.
 * Ответ — ключ для PUT /api/account/verification.
 */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!isProvider(user)) {
    return NextResponse.json({ error: 'Требуется аккаунт исполнителя' }, { status: 403 });
  }
  if (!checkRateLimit(`verification-file:${user.id}`, { limit: 10, windowMs: 60 * 60_000 }).ok) {
    return NextResponse.json({ error: 'Слишком много файлов, попробуйте позже' }, { status: 429 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Выберите файл' }, { status: 400 });
  }
  if (!isAllowedUploadType(file.type)) {
    return NextResponse.json({ error: 'Допустимы только JPEG, PNG, WebP и PDF' }, { status: 415 });
  }
  if (file.size === 0) return NextResponse.json({ error: 'Файл пустой' }, { status: 400 });
  if (file.size > getUploadMaxBytes(file.type)) {
    return NextResponse.json({ error: uploadTooLargeMessage(file.type) }, { status: 413 });
  }
  const key = privateVerificationKey(user.companyId, file.name);
  const folder = key.slice(0, key.lastIndexOf('/') + 1);
  const [inFolder, inAll] = await Promise.all([
    prisma.storedFile.aggregate({ where: { key: { startsWith: folder } }, _sum: { size: true } }),
    prisma.storedFile.aggregate({ _sum: { size: true } }),
  ]);
  if (
    (inFolder._sum.size ?? 0) + file.size > STORE_LIMITS.perFolder ||
    (inAll._sum.size ?? 0) + file.size > STORE_LIMITS.total
  ) {
    return NextResponse.json({ error: STORE_FULL_MESSAGE }, { status: 507 });
  }
  await prisma.storedFile.create({
    data: {
      key,
      data: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
      size: file.size,
    },
  });
  return NextResponse.json({ key }, { status: 201 });
}
