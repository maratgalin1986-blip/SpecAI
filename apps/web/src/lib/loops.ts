// Short muted loops of real footage (Mixkit, free licence; see /credits) for
// the machine landings, «Как это работает» and the cinema bands (owner,
// 2026-10-06: «оживи сайт новыми анимациями и видео»). Files in
// public/loops: <name>.mp4 (1280×720, ≤1.5 MB), <name>-sm.mp4 (854×480,
// ≤0.6 MB) and <name>.webp (poster, ≤90 KB), cut to loop seamlessly, no audio,
// graded warm like the /stroyka zone films. Checked by loops.test.ts.

export type Loop = {
  /** Mixkit clip id the loop is cut from. */
  mixkit: number;
  /** What the footage shows (credits, screen readers). */
  alt: string;
};

export const LOOPS = {
  'backhoe-clear': { mixkit: 49142, alt: 'Экскаватор-погрузчик расчищает участок ковшом' },
  'excavator-gold': { mixkit: 10161, alt: 'Гусеничный экскаватор на грунте в закатном свете' },
  'demolish-house': { mixkit: 48655, alt: 'Экскаватор разбирает старый дом' },
  'loader-tip': { mixkit: 49190, alt: 'Погрузчик высыпает грунт в самосвал, вид сверху' },
  'dozer-aerial': { mixkit: 32401, alt: 'Бульдозер на грунтовой площадке, вид сверху' },
  'dump-quarry': { mixkit: 45815, alt: 'Самосвал с камнем едет по карьеру' },
  'tractor-field': { mixkit: 25061, alt: 'Трактор обрабатывает поле' },
  'step-call': { mixkit: 1442, alt: 'Прораб на объекте звонит по телефону' },
  'step-dispatch': { mixkit: 24213, alt: 'Диспетчер с гарнитурой принимает заявку' },
  'step-plan': { mixkit: 23170, alt: 'Двое на объекте сверяются с чертежом' },
  'step-work': { mixkit: 49192, alt: 'Экскаватор грузит грунт в самосвал, вид сверху' },
  'crane-dusk': { mixkit: 3970, alt: 'Башенный кран на закате' },
} satisfies Record<string, Loop>;

export type LoopName = keyof typeof LOOPS;

export const loopSrc = (name: LoopName, light: boolean) =>
  `/loops/${name}${light ? '-sm' : ''}.mp4`;
export const loopPoster = (name: LoopName) => `/loops/${name}.webp`;

// One loop per machine landing where a fitting clip exists; the others keep
// the machine photo in their cinema band.
const LANDING_LOOPS: Record<string, LoopName> = {
  'ekskavator-pogruzchik': 'backhoe-clear',
  'gusenichnyj-ekskavator': 'excavator-gold',
  'kolyosnyj-ekskavator-gidromolot': 'demolish-house',
  'frontalnyj-pogruzchik': 'loader-tip',
  buldozer: 'dozer-aerial',
  samosval: 'dump-quarry',
  traktor: 'tractor-field',
};

export function landingLoop(slug: string): LoopName | undefined {
  return LANDING_LOOPS[slug];
}

/** «Как это работает»: one loop per step, in step order. */
export const STEP_LOOPS: LoopName[] = ['step-call', 'step-dispatch', 'step-plan', 'step-work'];
