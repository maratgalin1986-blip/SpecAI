import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { checkRateLimit } from '@/lib/rateLimit';
import { getBlobToken } from '@/lib/blob';
import { notifyTelegram } from '@/lib/notify';
import {
  isPhotoType,
  PHOTO_MAX_BYTES,
  photoSubmissionError,
  photoTelegramText,
  type PhotoRole,
} from '@/lib/photoShare';

// POST /api/photos (multipart): photos from a job site for the owner to
// review. Fields: files (1–3 images), role (client | executor), consent=1,
// note (clients only), page. Nothing is published automatically.

const RATE_LIMIT = { limit: 5, windowMs: 10 * 60_000 };

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rate = checkRateLimit(`photos:${ip}`, RATE_LIMIT);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Слишком много отправок, попробуйте позже' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Ожидается multipart/form-data' }, { status: 400 });
  }

  const files = form.getAll('files').filter((item): item is File => item instanceof File);
  const role = String(form.get('role') ?? '') as PhotoRole;
  const note = String(form.get('note') ?? '').trim() || undefined;
  const page = String(form.get('page') ?? '').slice(0, 200) || undefined;
  const submission = {
    role,
    consent: form.get('consent') === '1',
    note,
    page,
    fileCount: files.length,
  };

  const problem = photoSubmissionError(submission);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  for (const file of files) {
    if (!isPhotoType(file.type)) {
      return NextResponse.json({ error: 'Подходят только фото: JPEG, PNG, WebP' }, { status: 415 });
    }
    if (file.size === 0 || file.size > PHOTO_MAX_BYTES) {
      return NextResponse.json({ error: 'Фото должно быть не больше 5 МБ' }, { status: 413 });
    }
  }

  const token = getBlobToken();
  if (!token) return NextResponse.json({ error: 'Хранилище не настроено' }, { status: 503 });

  try {
    const urls = await Promise.all(
      files.map(async (file) => {
        const blob = await put(`photos/pending/${role}/site.jpg`, file, {
          access: 'public',
          addRandomSuffix: true,
          contentType: file.type,
          token,
        });
        return blob.url;
      }),
    );
    await notifyTelegram(photoTelegramText(submission, urls));
    return NextResponse.json({ ok: true, count: urls.length }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить фото' }, { status: 502 });
  }
}
