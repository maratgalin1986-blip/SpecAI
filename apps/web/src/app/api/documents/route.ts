import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { createProviderDocumentSchema } from '@specai/shared';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { documentsSummary, withStatus } from '@/lib/documents';
import { isProvider } from '@/lib/fleet';
import { isSafeHttpUrl } from '@/lib/privacy';
import { checkRateLimit } from '@/lib/rateLimit';
import { getRequestUser } from '@/lib/requestUser';

export const dynamic = 'force-dynamic';

const FORBIDDEN = { error: 'Документы ведёт только аккаунт исполнителя' };

/**
 * GET /api/documents[?equipmentId=] — the company's documents (company-wide,
 * per machine, per operator), soonest expiry first, with a summary.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!isProvider(user)) return NextResponse.json(FORBIDDEN, { status: 403 });
  const equipmentId = request.nextUrl.searchParams.get('equipmentId') ?? undefined;
  const documents = await prisma.providerDocument.findMany({
    where: { companyId: user.companyId, ...(equipmentId ? { equipmentId } : {}) },
    orderBy: [{ expiresAt: 'asc' }, { createdAt: 'desc' }],
    take: 500,
  });
  const now = new Date();
  return NextResponse.json({
    documents: documents.map((doc) => withStatus(doc, now)),
    summary: documentsSummary(documents, now),
  });
}

/** POST /api/documents — a new document of the company (or of one of its machines). */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!isProvider(user)) return NextResponse.json(FORBIDDEN, { status: 403 });
  if (!checkRateLimit(`documents:${user.id}`, { limit: 30, windowMs: 60_000 }).ok) {
    return NextResponse.json({ error: 'Слишком часто, попробуйте через минуту' }, { status: 429 });
  }
  const body = await readJson(request);
  if (body === null) return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  const parsed = createProviderDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const data = parsed.data;
  if (data.equipmentId) {
    const machine = await prisma.equipment.findUnique({
      where: { id: data.equipmentId },
      select: { companyId: true },
    });
    if (!machine || machine.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Можно прикрепить только свою технику' }, { status: 403 });
    }
  }
  if (data.fileUrl && !isSafeHttpUrl(data.fileUrl)) {
    return NextResponse.json({ error: 'Ссылка на файл должна быть https' }, { status: 400 });
  }
  const document = await prisma.providerDocument.create({
    data: { ...data, companyId: user.companyId },
  });
  return NextResponse.json({ document: withStatus(document, new Date()) }, { status: 201 });
}
