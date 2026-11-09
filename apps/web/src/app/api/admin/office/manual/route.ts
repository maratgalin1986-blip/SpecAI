import { NextRequest, NextResponse } from 'next/server';
import { findCityInText } from '@specai/shared';
import { z } from 'zod';
import { isAdminRequest } from '@/lib/admin';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { agentById } from '@/lib/office/agents';
import { createManualProspects } from '@/lib/office/run';
import { parseManualLines } from '@/lib/office/sources/manual';
import type { SourceCity } from '@/lib/office/sources/types';

export const dynamic = 'force-dynamic';

// «Добавить вручную» из /admin/office: строки «Название; телефон; город; почта; whatsapp» (R7).
const schema = z.object({
  agent: z.string().trim().min(1, 'Выберите агента').max(32),
  text: z
    .string()
    .trim()
    .min(1, 'Вставьте хотя бы одну строку «Название; телефон; город»')
    .max(20_000, 'Слишком много строк за раз — добавьте частями'),
});

function findCity(text: string): SourceCity | null {
  const found = findCityInText(text, { address: true });
  return found ? { name: found.city.name, lat: found.city.lat, lon: found.city.lon } : null;
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest()) return NextResponse.json({ error: 'Нет доступа' }, { status: 401 });
  const json = await readJson(request);
  if (json === null) return NextResponse.json({ error: INVALID_JSON_MESSAGE }, { status: 400 });
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const agent = agentById(parsed.data.agent.toLowerCase());
  if (!agent) return NextResponse.json({ error: 'Неизвестный агент' }, { status: 400 });
  const lines = parseManualLines(parsed.data.text, findCity);
  if (lines.candidates.length === 0) {
    return NextResponse.json({ created: 0, skipped: 0, errors: lines.errors });
  }
  const result = await createManualProspects(agent.id, lines.candidates);
  return NextResponse.json({
    created: result.created,
    skipped: result.skipped,
    errors: lines.errors,
  });
}
