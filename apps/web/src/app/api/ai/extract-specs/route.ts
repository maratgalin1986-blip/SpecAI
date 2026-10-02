import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  extractEquipmentSpecs,
  extractEquipmentSpecsFromFile,
  isSpecFileMediaType,
} from '@specai/ai-service';
import { getRequestUser } from '@/lib/requestUser';
import { checkRateLimit } from '@/lib/rateLimit';
import { getUploadMaxBytes, isImageMediaType, isOurBlobUrl } from '@/lib/blob';
import { isFleetManager } from '@/lib/fleet';

const requestSchema = z.union([
  z.object({ sourceText: z.string().min(1).max(8000) }),
  z.object({ fileUrl: z.string().url().refine(isOurBlobUrl, 'Допустимы только наши файлы') }),
]);

const RATE_LIMIT = { limit: 10, windowMs: 60_000 };

class FileFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function fetchBlobAsBase64(fileUrl: string) {
  const response = await fetch(fileUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new FileFetchError('Не удалось скачать файл', 400);
  }

  const mediaType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
  if (!isSpecFileMediaType(mediaType)) {
    throw new FileFetchError('Поддерживаются только JPEG, PNG, WebP и PDF', 415);
  }

  // Anthropic отклоняет изображения больше 5 МБ, поэтому для картинок лимит жёстче.
  const maxBytes = getUploadMaxBytes(mediaType);
  const tooLarge = () =>
    isImageMediaType(mediaType)
      ? new FileFetchError('Изображение больше 5 МБ — сожмите его', 400)
      : new FileFetchError('Файл больше 10 МБ', 413);

  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > maxBytes) {
    throw tooLarge();
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new FileFetchError('Файл пустой', 400);
  }
  if (bytes.byteLength > maxBytes) {
    throw tooLarge();
  }

  return { data: bytes.toString('base64'), mediaType };
}

export async function POST(request: NextRequest) {
  const currentUser = await getRequestUser(request);
  if (!isFleetManager(currentUser)) {
    return NextResponse.json({ error: 'Требуется аккаунт поставщика' }, { status: 403 });
  }

  const rate = checkRateLimit(`ai:extract-specs:${currentUser.id}`, RATE_LIMIT);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Слишком много запросов, попробуйте позже' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let file: Awaited<ReturnType<typeof fetchBlobAsBase64>> | undefined;
  if ('fileUrl' in parsed.data) {
    try {
      file = await fetchBlobAsBase64(parsed.data.fileUrl);
    } catch (error) {
      if (error instanceof FileFetchError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      return NextResponse.json({ error: 'Не удалось скачать файл' }, { status: 400 });
    }
  }

  try {
    const specs = file
      ? await extractEquipmentSpecsFromFile(file)
      : await extractEquipmentSpecs((parsed.data as { sourceText: string }).sourceText);
    return NextResponse.json(specs);
  } catch {
    return NextResponse.json(
      { error: 'Извлечение характеристик сейчас недоступно' },
      { status: 502 },
    );
  }
}
