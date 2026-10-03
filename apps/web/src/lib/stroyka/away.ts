// «Пока вас не было…»: how long the visitor was away and what got built,
// from a local snapshot of their last visit. Only real, derived numbers.

import { STAGES, type WorldProgress } from '@/lib/stroyka/progress';

export interface VisitSnapshot {
  at: number;
  projectIndex: number;
  projectName: string;
  stage: number;
  stagePercent: number;
  floorsBuilt: number;
  floors: number;
}

const DAY = 86_400_000;
const MSK = 3 * 3_600_000;

export function snapshot(p: WorldProgress, at: number): VisitSnapshot {
  return {
    at,
    projectIndex: p.projectIndex,
    projectName: p.projectName,
    stage: p.stage,
    stagePercent: p.stagePercent,
    floorsBuilt: p.floorsBuilt,
    floors: p.floors,
  };
}

/** Whole Moscow calendar days between two moments. */
export function daysBetween(from: number, to: number): number {
  const day = (t: number) => Math.floor((t + MSK) / DAY);
  return Math.max(0, day(to) - day(from));
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «5 дней», «3 недели», «2 месяца». */
export function awayFor(days: number): string {
  if (days < 14) return `${days} ${plural(days, 'день', 'дня', 'дней')}`;
  if (days < 60) {
    const w = Math.round(days / 7);
    return `${w} ${plural(w, 'неделю', 'недели', 'недель')}`;
  }
  const m = Math.round(days / 30);
  return `${m} ${plural(m, 'месяц', 'месяца', 'месяцев')}`;
}

const DONE: Record<string, string> = {
  pit: 'выкопали котлован',
  foundation: 'залили фундамент',
  roof: 'смонтировали кровлю',
  facade: 'закрыли фасад',
  utilities: 'проложили инженерные сети',
  interior: 'закончили отделку',
  landscape: 'сделали благоустройство',
  handover: 'сдали объект',
};

function floorsPhrase(n: number) {
  return `${n} ${plural(n, 'этаж', 'этажа', 'этажей')}`;
}

/** What was built between two states of the same object. */
export function builtBetween(before: VisitSnapshot, now: WorldProgress): string[] {
  const done: string[] = [];
  for (let s = before.stage; s < now.stage; s++) {
    const key = STAGES[s]!.key;
    if (key === 'frame') continue;
    done.push(DONE[key]!);
  }
  const framePassed = before.stage <= 2 && now.stage >= 2;
  if (framePassed) {
    const from = before.stage < 2 ? 0 : before.floorsBuilt;
    const to = now.stage > 2 ? now.floors : now.floorsBuilt;
    const gained = to - from;
    if (gained > 0) {
      const phrase = `подняли ${floorsPhrase(gained)} каркаса`;
      // Keep the order of work: frame comes after the foundation.
      const at = done.indexOf(DONE.foundation!) + 1;
      done.splice(at > 0 ? at : 0, 0, phrase);
    }
  }
  return done;
}

/**
 * Михалыч's greeting for a returning visitor, or null on a first visit.
 */
export function awayMessage(
  before: VisitSnapshot | null,
  now: WorldProgress,
  nowMs: number,
): string | null {
  if (!before) return null;
  const days = daysBetween(before.at, nowMs);
  if (now.projectIndex > before.projectIndex) {
    const head = days > 0 ? `Вас не было ${awayFor(days)}` : 'С возвращением';
    const n = now.projectIndex - before.projectIndex;
    const what =
      n === 1
        ? `${before.projectName} уже сдали, начали ${lowerFirst(now.projectName)} по соседству`
        : `сдали ещё ${n} ${plural(n, 'объект', 'объекта', 'объектов')}, сейчас строим ${lowerFirst(now.projectName)}`;
    return `${head} — ${what}.`;
  }
  if (now.projectIndex < before.projectIndex) return null;
  if (days === 0) {
    // Same day: small steps.
    if (now.stage === before.stage && now.stage === 2) {
      const frac = ((now.stagePercent - before.stagePercent) / 100) * now.floors;
      if (frac >= 1.5)
        return `С возвращением! С утра подняли ещё ${floorsPhrase(Math.floor(frac))}.`;
      if (frac >= 0.3) return 'С возвращением! С утра подняли ещё полэтажа.';
    }
    const done = builtBetween(before, now);
    if (done.length) return `С возвращением! Пока вас не было: ${done.join(', ')}.`;
    return 'С возвращением! Работа идёт по плану.';
  }
  const done = builtBetween(before, now);
  const head = `Вас не было ${awayFor(days)}.`;
  if (done.length) return `${head} За это время: ${done.join(', ')}.`;
  if (now.stagePercent > before.stagePercent)
    return `${head} «${now.stageName}» продвинулся: было ${before.stagePercent}%, стало ${now.stagePercent}%.`;
  return `${head} С возвращением!`;
}

function lowerFirst(text: string) {
  // «ЖК «Кама»» and «Торговый центр «Квартал»» keep their capitals; common nouns go lower-case.
  return /^(ЖК|ТЦ)/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
}
