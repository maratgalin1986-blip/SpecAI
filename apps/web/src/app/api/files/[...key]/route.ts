import { NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { isAllowedUploadType } from '@/lib/blob';
import { isPrivateKey } from '@/lib/privateFiles';

export const dynamic = 'force-dynamic';

const CACHE = 'public, max-age=31536000, immutable';

// A file kept in the database (lib/fileStore.ts): public by its unguessable
// key, like a Vercel Blob link (the company id in the key is public anyway —
// /providers/<id>). Only the upload types are served, never as a page:
// `sandbox` keeps a crafted PDF from acting as the site, and a PDF downloads
// rather than opening on our domain. The CDN keeps a copy, so a photo seen by
// many is read from the database once.
export async function GET(_request: Request, { params }: { params: { key: string[] } }) {
  let key: string;
  try {
    key = params.key.map((part) => decodeURIComponent(part)).join('/');
  } catch {
    return NextResponse.json({ error: 'Файл не найден' }, { status: 404 });
  }
  // Документы для проверки (СТС) — только через /api/private-files с правами.
  if (isPrivateKey(key)) return NextResponse.json({ error: 'Файл не найден' }, { status: 404 });
  const file = await prisma.storedFile.findUnique({ where: { key } }).catch(() => null);
  if (!file || !isAllowedUploadType(file.contentType)) {
    return NextResponse.json({ error: 'Файл не найден' }, { status: 404 });
  }
  const bytes = new Uint8Array(file.data);
  return new NextResponse(bytes, {
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': CACHE,
      'CDN-Cache-Control': CACHE,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'",
      'Content-Disposition': file.contentType === 'application/pdf' ? 'attachment' : 'inline',
    },
  });
}
