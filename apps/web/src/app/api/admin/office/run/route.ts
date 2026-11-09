import { NextRequest, NextResponse } from 'next/server';
import { cityByName } from '@specai/shared';
import { z } from 'zod';
import { isAdminRequest } from '@/lib/admin';
import { INVALID_JSON_MESSAGE, readJson, zodErrorMessage } from '@/lib/apiInput';
import { agentById } from '@/lib/office/agents';
import { nicheByKey } from '@/lib/office/niches';
import { runStep } from '@/lib/office/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// «Запустить шаг» из /admin/office: один прогон «агент × ниша × город» прямо сейчас (spec §6).
const schema = z.object({
  agent: z.string().trim().min(1, 'Выберите агента').max(32),
  niche: z.string().trim().min(1, 'Выберите нишу').max(32),
  city: z.string().trim().min(1, 'Укажите город').max(80),
});

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
  const niche = nicheByKey(parsed.data.niche.toLowerCase());
  if (!niche || niche.agent !== agent.id) {
    return NextResponse.json({ error: `Ниша не подходит агенту «${agent.name}»` }, { status: 400 });
  }
  const city = cityByName(parsed.data.city);
  if (!city) {
    return NextResponse.json(
      { error: `Город «${parsed.data.city}» не найден в списке городов` },
      { status: 400 },
    );
  }
  const result = await runStep({
    agent: agent.id,
    niche: niche.key,
    city: city.name,
    trigger: 'admin',
  });
  return NextResponse.json({
    found: result.found,
    created: result.created,
    skipped: result.skipped,
    error: result.error ?? null,
  });
}
