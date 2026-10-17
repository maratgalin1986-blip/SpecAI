import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/requestUser';
import { checkRateLimit } from '@/lib/rateLimit';
import { getUploadMaxBytes, isAllowedUploadType, uploadTooLargeMessage } from '@/lib/blob';
import { isOperator, isProvider } from '@/lib/fleet';
import { StoreFullError, storeFile } from '@/lib/fileStore';

const RATE_LIMIT = { limit: 30, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  // Providers upload machine photos; their operators the shift's start/end photos.
  if (!isProvider(currentUser) && !isOperator(currentUser)) {
    return NextResponse.json({ error: 'Требуется аккаунт исполнителя' }, { status: 403 });
  }

  const rate = checkRateLimit(`uploads:${currentUser.id}`, RATE_LIMIT);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Слишком много запросов, попробуйте позже' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Ожидается multipart/form-data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Поле file обязательно' }, { status: 400 });
  }

  if (!isAllowedUploadType(file.type)) {
    return NextResponse.json({ error: 'Допустимы только JPEG, PNG, WebP и PDF' }, { status: 415 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'Файл пустой' }, { status: 400 });
  }
  if (file.size > getUploadMaxBytes(file.type)) {
    return NextResponse.json({ error: uploadTooLargeMessage(file.type) }, { status: 413 });
  }

  const safeName = (file.name || 'file').replace(/[^\w.-]+/g, '_').slice(-80) || 'file';

  try {
    const url = await storeFile(
      `equipment/${currentUser.companyId ?? 'unknown'}/${safeName}`,
      file,
    );

    return NextResponse.json({ url, contentType: file.type, size: file.size }, { status: 201 });
  } catch (error) {
    if (error instanceof StoreFullError) {
      return NextResponse.json({ error: error.message }, { status: 507 });
    }
    return NextResponse.json({ error: 'Не удалось загрузить файл' }, { status: 502 });
  }
}
