// Which /smeta calculator job fits the conversation. Tiny on purpose: the HUD
// and the order panel use it without pulling in the chat brain.
import type { MachineType } from '@/lib/machinePhotos';

const JOB_BY_TASK: [RegExp, string][] = [
  [/транше|коммуникац|водопровод|канализ|кабел/, 'trench'],
  [/котлован|фундамент|септик/, 'pit'],
  [/планиров|выровн|разровн/, 'planning'],
  [/вывоз|вывез|мусор|сыпуч|щеб|песок/, 'haul'],
  [/демонтаж|разбить|снести/, 'demolition'],
  [/плит|ферм|монтаж|кровл/, 'lift'],
  [/блок|поддон|разгруз/, 'kmu'],
  [/фасад|окн|вывеск|высот/, 'height'],
  [/укат|катк|асфальт/, 'compaction'],
  [/снег/, 'snow'],
];
const JOB_BY_MACHINE: Partial<Record<MachineType, string>> = {
  backhoe: 'trench',
  excavator: 'pit',
  'wheeled-excavator': 'demolition',
  crane: 'lift',
  kmu: 'kmu',
  agp: 'height',
  roller: 'compaction',
  truck: 'haul',
  dozer: 'planning',
  loader: 'snow',
  tractor: 'snow',
};

/** The estimate job for the conversation (lib/smeta job ids). */
export function smetaJob(task?: string | null, machine?: MachineType | null): string | null {
  const t = task ? task.toLowerCase().replace(/ё/g, 'е') : '';
  const byTask = JOB_BY_TASK.find(([re]) => re.test(t))?.[1];
  return byTask ?? (machine ? (JOB_BY_MACHINE[machine] ?? null) : null);
}

/** «/smeta?job=pit» for the conversation, or the plain calculator. */
export function smetaHref(task?: string | null, machine?: MachineType | null): string {
  const job = smetaJob(task, machine);
  return job ? `/smeta?job=${job}` : '/smeta';
}
