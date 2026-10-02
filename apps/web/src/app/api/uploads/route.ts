import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getRequestUser } from '@/lib/requestUser';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  getBlobToken,
  getUploadMaxBytes,
  isAllowedUploadType,
  uploadTooLargeMessage,
} from '@/lib/blob';
import { isProvider } from '@/lib/fleet';

const RATE_LIMIT = { limit: 30, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!isProvider(currentUser)) {
    return NextResponse.json({ error: 'Требуется аккаунт поставщика' }, { status: 403 });
  }

  const rate = checkRateLimit(`uploads:${currentUser.id}`, RATE_LIMIT);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Слишком много запросов, попробуйте позже' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  const token = getBlobToken();
  if (!token) {
    return NextResponse.json({ error: 'Хранилище не настроено' }, { status: 503 });
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
    const blob = await put(`equipment/${currentUser.companyId ?? 'unknown'}/${safeName}`, file, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type,
      token,
    });

    return NextResponse.json(
      { url: blob.url, contentType: file.type, size: file.size },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить файл' }, { status: 502 });
  }
}
