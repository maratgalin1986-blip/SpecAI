import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { isAdminRequest } from '@/lib/admin';
import { INVALID_JSON_MESSAGE, prismaErrorCode, readJson } from '@/lib/apiInput';
import { domainKeys, normalizeDomain } from '@/lib/office/domains';
import { validateSiteContent } from '@/lib/office/siteContent';
import { siteJsonFor } from '@/lib/office/siteEditor';

export const dynamic = 'force-dynamic';

// Правка клиентского сайта из /admin/office/<id> (S5) и его свой домен (S7):
// { content, domain } → Prospect.siteJson (пустая правка — null, сайт как по карточке) и
// Prospect.domain (пусто — домен не подключён). Без поля domain домен не меняется.
const ID = /^[\w-]{1,64}$/;

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  }
  if (!ID.test(params.id)) {
    return NextResponse.json({ error: 'Кандидат не найден' }, { status: 404 });
  }
  const json = await readJson(request);
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  }
  const body = json as { content?: unknown; domain?: unknown };

  const checked = validateSiteContent(body.content ?? {});
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const data: { siteJson: string | null; domain?: string | null } = {
    siteJson: siteJsonFor(checked.content),
  };
  if (body.domain !== undefined) {
    const domain = normalizeDomain(body.domain);
    if (!domain.ok) return NextResponse.json({ error: domain.error }, { status: 400 });
    data.domain = domain.domain;
  }

  const prospect = await prisma.prospect.findUnique({
    where: { id: params.id },
    select: { id: true, kind: true },
  });
  if (!prospect) return NextResponse.json({ error: 'Кандидат не найден' }, { status: 404 });
  if (prospect.kind !== 'site') {
    return NextResponse.json(
      { error: 'Редактор только для сайтов агента «Сайты под ключ»' },
      { status: 409 },
    );
  }

  // Один домен — один сайт. Уникального индекса в базе нет (db push на проде остановился бы
  // на нём), поэтому проверка здесь — по обоим вариантам записи (с «www.» и без).
  if (data.domain) {
    const taken = await prisma.prospect.findFirst({
      where: { domain: { in: domainKeys(data.domain) }, NOT: { id: prospect.id } },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json({ error: 'Этот домен уже у другого сайта' }, { status: 409 });
    }
  }

  try {
    await prisma.prospect.update({ where: { id: prospect.id }, data });
  } catch (error) {
    const code = prismaErrorCode(error);
    if (code === 'P2002') {
      return NextResponse.json({ error: 'Этот домен уже у другого сайта' }, { status: 409 });
    }
    if (code === 'P2025') {
      return NextResponse.json({ error: 'Кандидат не найден' }, { status: 404 });
    }
    throw error;
  }
  return NextResponse.json({ ok: true });
}
