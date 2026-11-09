// Офис агентов (spec §9): команда владельца в личке бота — «/office <ниша> <город>»
// (или «/офис …»). Ниша — ключ («dentist») или русское название («стоматология»),
// город — остаток строки из списка городов; агент определяется по нише.

import { cityByName } from '@specai/shared';
import { NICHES, type Niche } from './niches';
import type { AgentId } from './types';

export type OfficeCommand =
  { ok: true; agent: AgentId; niche: string; city: string } | { ok: false; help: string };

const COMMAND = /^\/(office|офис)(@\w+)?(?:\s+|$)/iu;

export function officeCommandHelp(): string {
  const niches = Object.values(NICHES)
    .map((n) => `${n.title.toLowerCase()} (${n.key})`)
    .join(', ');
  return (
    'Команда: /office <ниша> <город>\nПример: /office стоматология Казань\n' + `Ниши: ${niches}.`
  );
}

/** null — текст не команда офиса; иначе разобранный шаг или подсказка. */
export function parseOfficeCommand(text: string): OfficeCommand | null {
  const match = COMMAND.exec(String(text ?? '').trim());
  if (!match) return null;
  const rest = String(text ?? '')
    .trim()
    .slice(match[0].length)
    .trim();
  if (!rest) return { ok: false, help: officeCommandHelp() };
  // Название ниши может быть из двух слов («салон красоты»): ищем самое длинное
  // совпадение в начале строки, остаток — город.
  const lower = rest.toLowerCase();
  let niche: Niche | null = null;
  let used = 0;
  for (const n of Object.values(NICHES)) {
    for (const word of [n.key, n.title.toLowerCase()]) {
      const next = lower.charAt(word.length);
      if (lower.startsWith(word) && (next === '' || /\s/.test(next)) && word.length > used) {
        niche = n;
        used = word.length;
      }
    }
  }
  if (!niche) {
    const nicheRaw = rest.split(/\s+/)[0] ?? rest;
    return { ok: false, help: `Неизвестная ниша «${nicheRaw}».\n${officeCommandHelp()}` };
  }
  const cityRaw = rest.slice(used).trim();
  if (!cityRaw) return { ok: false, help: `Укажите город.\n${officeCommandHelp()}` };
  const city = cityByName(cityRaw);
  if (!city) {
    return {
      ok: false,
      help: `Город «${cityRaw}» не найден в списке городов.\n${officeCommandHelp()}`,
    };
  }
  return { ok: true, agent: niche.agent, niche: niche.key, city: city.name };
}
