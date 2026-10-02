import { SHIFT, SITE } from '@/lib/site';

// The site's dispatcher without a paid AI: it reads the visitor's message
// with plain rules, suggests the machine for the job, answers the common
// questions with facts the site already states, and turns a phone number
// typed into the chat into a callback request. Pure functions, no I/O.

/** A Russian phone number in the text, normalised to +7XXXXXXXXXX, or null. */
export function findPhone(text: string): string | null {
  for (const match of text.matchAll(
    /(?:\+?[78])?[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g,
  )) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length === 10 && digits.startsWith('9')) return `+7${digits}`;
    if (digits.length === 11 && /^[78]9/.test(digits)) return `+7${digits.slice(1)}`;
  }
  return null;
}

export interface TaskMatch {
  /** Category name as stored in the catalogue. */
  category: string;
  /** Why this machine fits, one short sentence. */
  why: string;
}

// Order matters: the first rule that matches wins, so the specific ones
// (a machine named outright) come before the job descriptions.
const RULES: { test: RegExp; category: string; why: string }[] = [
  {
    test: /экскаватор-погруз|погрузчик-экскав|jcb|4cx|3cx/,
    category: 'Экскаваторы-погрузчики',
    why: 'копает и грузит одной машиной',
  },
  {
    test: /гидромолот|молот|демонтаж|разбить|бетон/,
    category: 'Экскаваторы',
    why: 'колёсный экскаватор с гидромолотом разбивает бетон, асфальт и мёрзлый грунт',
  },
  {
    test: /экскав/,
    category: 'Экскаваторы',
    why: 'для котлованов и больших объёмов земляных работ',
  },
  {
    test: /автокран|кран(?!.*манипул)/,
    category: 'Краны',
    why: 'поднимет и установит тяжёлые грузы',
  },
  {
    test: /манипул|кму|перевез.*(груз|блок|плит)|привез.*и.*выгруз/,
    category: 'Манипуляторы',
    why: 'привезёт груз и сам выгрузит краном',
  },
  {
    test: /вышк|агп|высот|фасад|кровл|спил|дерев|освещ|фонар/,
    category: 'Автовышки',
    why: 'для работ на высоте',
  },
  {
    test: /каток|катк|уплотн|утрамб|асфальт/,
    category: 'Катки',
    why: 'уплотнит грунт, щебень или асфальт',
  },
  {
    test: /самосв|вывез|вывоз|мусор|привез.*(песок|щеб|грунт|пгс)|песок|щебень|пгс/,
    category: 'Самосвалы',
    why: 'вывезет грунт и мусор или привезёт сыпучие материалы',
  },
  {
    test: /бульд|планиров|разровн|выровн|засып/,
    category: 'Бульдозеры',
    why: 'спланирует участок и переместит грунт',
  },
  {
    test: /трактор|мтз|беларус|покос|косить/,
    category: 'Тракторы',
    why: 'для вспомогательных и коммунальных работ',
  },
  {
    test: /снег|погрузчик|погруз(ить|ка)|фронтал/,
    category: 'Погрузчики',
    why: 'погрузит сыпучие материалы и уберёт снег',
  },
  {
    test: /транше|траншея|траншею|канав|котлован|яму|ямы|копать|выкопать|рыть|вырыть|фундамент|септик|водопровод|канализ|кабел/,
    category: 'Экскаваторы-погрузчики',
    why: 'траншеи, ямы и котлованы, а потом засыпка и погрузка',
  },
];

export function matchTask(text: string): TaskMatch | null {
  const lower = text.toLowerCase();
  const rule = RULES.find(({ test }) => test.test(lower));
  return rule ? { category: rule.category, why: rule.why } : null;
}

/** Answers to common questions, from facts the site already states. */
export function faqAnswers(text: string): string[] {
  const lower = text.toLowerCase();
  const answers: string[] = [];
  if (/ндс|безнал|договор|эдо|счёт|счет|юрлиц|организац/.test(lower)) {
    answers.push('Работаем с НДС, по договору, есть ЭДО.');
  }
  if (/смен|минимал|сколько час|почасов/.test(lower)) {
    answers.push('Смена — 8 часов, цена за смену = 8 × цена часа. Все цены — с машинистом.');
  }
  if (/когда|сегодня|завтра|срочн|быстро|подач/.test(lower)) {
    answers.push('Подаём обычно в день заявки — точное время подтвердит диспетчер.');
  }
  if (/режим|часы работы|выходн|воскрес|до скольки|во сколько/.test(lower)) {
    answers.push(`Режим работы: ${SITE.workingHours}.`);
  }
  if (/где|город|район|елабуг|нижнекам|менделеев|татарстан|выезд/.test(lower)) {
    answers.push(
      `Работаем в ${SITE.city === 'Набережные Челны' ? 'Набережных Челнах' : SITE.city} и по Татарстану.`,
    );
  }
  if (/посредник|поставщик|своя техника|чья техника/.test(lower)) {
    answers.push(
      `${SITE.name} — сервис заказа спецтехники: заявку видят исполнители со своей техникой и машинистами, включая парк ${SITE.name}, вы выбираете предложение. Сервис бесплатный.`,
    );
  }
  return answers;
}

export function wantsPrice(text: string): boolean {
  return /сколько|цен|стоим|прайс|почём|почем|₽|руб/.test(text.toLowerCase());
}

/** What the dispatcher says once a phone number arrived and the lead was saved. */
export function leadAcceptedText(onShift: boolean): string {
  return onShift
    ? `Принято! Диспетчер ${SITE.name} перезвонит в течение 15 минут и назовёт точную цену.`
    : `Принято! Сейчас нерабочее время — диспетчер перезвонит утром, с ${SHIFT.from}:00.`;
}

export const ASK_FOR_PHONE =
  `Напишите номер телефона прямо здесь — диспетчер перезвонит, уточнит адрес и дату и назовёт точную цену. ` +
  `Или позвоните сами: ${SITE.phone}.`;
