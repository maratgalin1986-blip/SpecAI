import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { StoreFullError, storeFile } from '@/lib/fileStore';
import { PHOTO_URL } from '@/lib/office/siteContent';
import { sitePhotoPath, sitePhotoProblem, sitePhotoStorePath } from '@/lib/office/siteEditor';
import { checkRateLimit } from '@/lib/rateLimit';
import { siteUrl } from '@/lib/siteUrl';

export const dynamic = 'force-dynamic';

// Фото для клиентского сайта из редактора /admin/office/<id> (S5): multipart `file`
// (JPEG/PNG/WebP до 5 МБ) и необязательный `slug` сайта (своя папка в хранилище).
// Ответ — адрес, который примет siteJson (PHOTO_URL): `/api/files/<ключ>` или Vercel Blob.
const RATE_LIMIT = { limit: 30, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  }
  const rate = checkRateLimit('admin-office-upload', RATE_LIMIT);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Слишком много загрузок подряд — подождите минуту' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Выберите фото для загрузки' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Выберите фото для загрузки' }, { status: 400 });
  }
  const problem = sitePhotoProblem(file);
  if (problem) return NextResponse.json({ error: problem.error }, { status: problem.status });
  const slug = form.get('slug');

  let stored: string;
  try {
    stored = await storeFile(
      sitePhotoStorePath(file.type, typeof slug === 'string' ? slug : null),
      file,
    );
  } catch (error) {
    if (error instanceof StoreFullError) {
      return NextResponse.json({ error: error.message }, { status: 507 });
    }
    return NextResponse.json(
      { error: 'Не удалось загрузить фото — попробуйте ещё раз' },
      { status: 502 },
    );
  }
  const url = sitePhotoPath(stored, siteUrl());
  if (!PHOTO_URL.test(url)) {
    return NextResponse.json(
      { error: 'Не удалось загрузить фото — попробуйте ещё раз' },
      { status: 502 },
    );
  }
  return NextResponse.json({ url }, { status: 201 });
}
