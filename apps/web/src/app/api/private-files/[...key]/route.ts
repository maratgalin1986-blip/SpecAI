import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';
import { isAllowedUploadType } from '@/lib/blob';
import { getRequestUser } from '@/lib/requestUser';
import { canReadPrivateFile } from '@/lib/privateFiles';

export const dynamic = 'force-dynamic';

const NOT_FOUND = { error: 'Файл не найден' };

/**
 * Закрытые документы проверки (СТС): только админ своей компании и админ
 * площадки. Чужим — 404, а не 403: не подтверждаем, что файл есть. Не кэшируется.
 */
export async function GET(request: NextRequest, { params }: { params: { key: string[] } }) {
  let key: string;
  try {
    key = params.key.map((part) => decodeURIComponent(part)).join('/');
  } catch {
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }
  const user = await getRequestUser(request);
  if (!canReadPrivateFile(key, user, isAdminRequest())) {
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }
  const file = await prisma.storedFile.findUnique({ where: { key } }).catch(() => null);
  if (!file || !isAllowedUploadType(file.contentType)) {
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }
  const bytes = new Uint8Array(file.data);
  return new NextResponse(bytes, {
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'",
      'Content-Disposition': file.contentType === 'application/pdf' ? 'attachment' : 'inline',
    },
  });
}
