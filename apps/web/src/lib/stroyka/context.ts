// One conversation state for the visitor across all characters: what they
// build, the machine, when, the address. Characters pass it on «по рации»,
// and the final order (form message or wizard link) is prefilled from it.

import { MACHINE_LABELS, type MachineType } from '@/lib/machinePhotos';
import type { SpeakerId } from '@/lib/stroyka';

export interface OrderContext {
  task?: string;
  machine?: MachineType;
  when?: string;
  address?: string;
  /** Reply labels chosen so far, in order. */
  answers: string[];
  /** Who has already talked to the visitor about the order. */
  heardBy: SpeakerId[];
  /** The callback form went through. */
  sent?: boolean;
}

export type ContextSet = Partial<Pick<OrderContext, 'task' | 'machine' | 'when' | 'address'>>;

export function emptyContext(): OrderContext {
  return { answers: [], heardBy: [] };
}

/** The context after a reply: new fields set, the answer remembered. */
export function applyReply(ctx: OrderContext, label: string, set?: ContextSet): OrderContext {
  const next: OrderContext = { ...ctx, answers: [...ctx.answers, label].slice(-12) };
  if (set) {
    for (const [key, value] of Object.entries(set) as [keyof ContextSet, string][]) {
      if (value) (next as unknown as Record<string, string>)[key] = value;
    }
  }
  return next;
}

/** Radio names: what the machine is called on site. */
export const MACHINE_SLANG: Record<MachineType, string> = {
  backhoe: 'JCB',
  excavator: 'гусеничный экскаватор',
  'wheeled-excavator': 'колёсный с гидромолотом',
  kmu: 'манипулятор',
  agp: 'автовышка',
  roller: 'каток',
  crane: 'автокран',
  loader: 'фронтальный погрузчик',
  truck: 'самосвал',
  dozer: 'бульдозер',
  tractor: 'трактор',
  trench: 'траншеекопатель',
};

const CALL_NAME: Record<SpeakerId, string> = {
  mihalych: 'Михалыч',
  rinat: 'Ринат',
  sveta: 'Света',
  ildar: 'Ильдар',
  alsu: 'Алсу',
};

/** «котлован под фундамент, нужен JCB на завтра, адрес: Тукаевский район». */
export function contextFacts(ctx: OrderContext): string {
  const parts: string[] = [];
  if (ctx.task) parts.push(ctx.task);
  if (ctx.machine) {
    const slang = MACHINE_SLANG[ctx.machine];
    const need = /а$/.test(slang) ? 'нужна' : 'нужен';
    parts.push(`${need} ${slang}${ctx.when ? ` на ${ctx.when.replace(/^на /, '')}` : ''}`);
  } else if (ctx.when) parts.push(`на ${ctx.when.replace(/^на /, '')}`);
  if (ctx.address) parts.push(`адрес: ${ctx.address}`);
  return parts.join(', ');
}

/** Which order fields are still unknown (in the order a dispatcher asks). */
export function missing(ctx: OrderContext): ('task' | 'machine' | 'when' | 'address')[] {
  const out: ('task' | 'machine' | 'when' | 'address')[] = [];
  if (!ctx.task) out.push('task');
  if (!ctx.machine) out.push('machine');
  if (!ctx.when) out.push('when');
  if (!ctx.address) out.push('address');
  return out;
}

export interface RadioLine {
  speaker: SpeakerId;
  text: string;
}

/**
 * The radio exchange when `from` passes the visitor to `to`. The receiver
 * repeats what is known and asks only for what is missing.
 */
export function radioHandoff(from: SpeakerId, to: SpeakerId, ctx: OrderContext): RadioLine[] {
  const facts = contextFacts(ctx);
  const call = `${CALL_NAME[to]}, приём! Тут человек${facts ? `: ${facts}` : ' — по технике'}.`;
  const first: RadioLine = { speaker: from, text: call };
  const gaps = missing(ctx);
  let answer: string;
  if (to === 'sveta') {
    const ask =
      gaps.includes('address') && gaps.includes('when')
        ? 'Адрес и на когда — скажете? И телефон.'
        : gaps.includes('address')
          ? 'Адрес точный скажете и телефон?'
          : gaps.includes('when')
            ? 'На какой день ставим? И телефон оставьте.'
            : 'Оставьте телефон — перезвоню и подтвержу.';
    const brand = ctx.machine ? ' Машину СпецПласт16 поставлю в график.' : '';
    const known = [
      ctx.task,
      ctx.machine && MACHINE_SLANG[ctx.machine],
      ctx.when && `на ${ctx.when}`,
    ]
      .filter(Boolean)
      .join(', ');
    answer = `Приняла, ${CALL_NAME[from]}. Здравствуйте!${known ? ` ${capital(known)} — записала.` : ''}${brand} ${ask}`;
  } else if (to === 'alsu') {
    answer = `Приняла, ${CALL_NAME[from]}. Материалы посчитаю, доставку самосвалом поставим со Светой.`;
  } else if (to === 'ildar') {
    answer = `Принял, ${CALL_NAME[from]}. Покажу кран в работе${ctx.when ? `, по ${ctx.when.replace(/^на /, '')} посмотрю ветер` : ''}.`;
  } else {
    answer = `Принял, ${CALL_NAME[from]}. Жду, покажу машину в работе.`;
  }
  return [first, { speaker: to, text: answer.replace(/\s+/g, ' ').trim() }];
}

/** What the next character says first, so the visitor never repeats themselves. */
export function contextIntro(ctx: OrderContext, speaker: SpeakerId): string {
  const facts = contextFacts(ctx);
  if (!facts) return '';
  const from = ctx.heardBy.filter((s) => s !== speaker).pop();
  const by = from ? `${CALL_NAME[from]} передал по рации` : 'Понял задачу';
  return `${by}: ${facts}.`;
}

function capital(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The callback form message, summarising the job. */
export function orderSummary(ctx: OrderContext): string {
  const lines: string[] = [];
  if (ctx.task) lines.push(`Задача: ${ctx.task}.`);
  if (ctx.machine) lines.push(`Техника: ${MACHINE_LABELS[ctx.machine]}.`);
  if (ctx.when) lines.push(`Когда: ${ctx.when}.`);
  if (ctx.address) lines.push(`Адрес: ${ctx.address}.`);
  return lines.length ? `${lines.join(' ')} (со стройки на сайте)` : '';
}

/** The wizard link for the machine in the context (or the generic wizard). */
export function wizardHref(ctx: OrderContext, fallback?: MachineType): string {
  const machine = ctx.machine ?? fallback;
  return machine ? `/?m=${machine}#podbor` : '/#podbor';
}

export interface OrderStep {
  key: 'task' | 'machine' | 'when' | 'address' | 'contact';
  label: string;
  value?: string;
  done: boolean;
}

/** «Наряд собран» progress: each known field fills a line of the work-order card. */
export function orderProgress(ctx: OrderContext): { steps: OrderStep[]; done: number } {
  const steps: OrderStep[] = [
    { key: 'task', label: 'Задача', value: ctx.task, done: !!ctx.task },
    {
      key: 'machine',
      label: 'Техника',
      value: ctx.machine && MACHINE_LABELS[ctx.machine],
      done: !!ctx.machine,
    },
    { key: 'when', label: 'Когда', value: ctx.when, done: !!ctx.when },
    { key: 'address', label: 'Адрес', value: ctx.address, done: !!ctx.address },
    {
      key: 'contact',
      label: 'Контакт',
      value: ctx.sent ? 'заявка у диспетчера' : undefined,
      done: !!ctx.sent,
    },
  ];
  return { steps, done: steps.filter((s) => s.done).length };
}

/** Replaces {facts}, {task}, {machine}, {when} in a line. */
export function renderLine(text: string, ctx: OrderContext): string {
  const out = text
    .replace('{facts}', contextFacts(ctx) || 'задача пока не ясна')
    .replace('{task}', ctx.task ?? 'задача')
    .replace('{machine}', ctx.machine ? MACHINE_SLANG[ctx.machine] : 'техника')
    .replace('{when}', ctx.when ?? 'когда удобно');
  return capital(out);
}
