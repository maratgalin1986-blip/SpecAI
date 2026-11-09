// The call script for the owner (R14). A pure template: the owner reads it
// aloud, so it is short spoken Russian, with nothing promised that the
// platform does not do (REVIEW § 5: no «лучшая цена», no «гарантируем»), no
// numbers but the prices passed in, and no name of the person calling — the
// owner introduces himself.
import { PLATFORM_PROMISE, PLATFORM_PROMISE_DETAIL } from '@specai/shared';
import { rub } from '@/lib/prices';
import { SITE } from '@/lib/site';
import type { PageProspect } from './pageTypes';

export interface CallScriptInput {
  previewUrl: string;
  /** Site price and monthly support (R16), in rubles. */
  prices: { setup: number; monthly: number };
  nicheTitle: string;
}

export interface CallScriptStep {
  heading: string;
  text: string;
}

export interface CallScript {
  title: string;
  steps: CallScriptStep[];
}

/** «15 000 ₽» with no-break spaces. */
export function rubles(value: number): string {
  return `${rub(value)}\u00a0₽`;
}

function where(p: PageProspect): string {
  const city = p.city?.trim();
  return city ? ` в городе ${city}` : '';
}

function siteScript(p: PageProspect, input: CallScriptInput): CallScript {
  const name = p.name.trim();
  const niche = input.nicheTitle.trim().toLowerCase();
  return {
    title: `Звонок: «${name}» — страница-визитка`,
    steps: [
      {
        heading: 'Приветствие',
        text:
          `Здравствуйте! Это ${SITE.name}, площадка ${SITE.platform}. ` +
          `Я говорю с владельцем или руководителем «${name}»? Удобно сейчас пару минут?`,
      },
      {
        heading: 'Зачем звоню',
        text:
          `Мы увидели вашу компанию на карте${where(p)}: ${niche}, есть телефон и адрес, ` +
          'а своей страницы в интернете нет. Мы уже сделали вам страницу-визитку по данным ' +
          `карточки. Можно открыть прямо сейчас, пока говорим: ${input.previewUrl}`,
      },
      {
        heading: 'Что на странице',
        text:
          'Название, чем занимаетесь, услуги, адрес, часы работы, кнопки «Позвонить» и ' +
          '«Написать в WhatsApp», ссылка на карту. Всё с вашей карточки, ничего не придумано. ' +
          'Если что-то не так — поправим за день.',
      },
      {
        heading: 'Предложение',
        text:
          `Страница под ключ — ${rubles(input.prices.setup)} один раз, дальше поддержка ` +
          `${rubles(input.prices.monthly)} в месяц: правки, работа страницы, ответы на вопросы. ` +
          'Как согласуем — страница откроется по своему адресу в тот же день.',
      },
      {
        heading: 'Если «дорого»',
        text:
          'Понимаю. Страница уже готова, вы видите, за что платите: ничего заказывать и ждать ' +
          'не надо. Если условия не подходят — скажите, какие подошли бы, передам руководителю ' +
          'и перезвоню.',
      },
      {
        heading: 'Если «подумаю»',
        text:
          'Конечно. Ссылка на страницу остаётся у вас, посмотрите спокойно. ' +
          'Когда вам удобно, чтобы я перезвонил — завтра или на следующей неделе? Запишу дату.',
      },
      {
        heading: 'Итог',
        text:
          'Поблагодарить за разговор. Отметить результат: «Согласился» — публикуем, ' +
          '«Перезвонить» — записать дату, «Отказ» — страница остаётся закрытой.',
      },
    ],
  };
}

function providerScript(p: PageProspect, input: CallScriptInput): CallScript {
  const name = p.name.trim();
  return {
    title: `Звонок: «${name}» — страница исполнителя`,
    steps: [
      {
        heading: 'Приветствие',
        text:
          `Здравствуйте! Это ${SITE.name}, площадка ${SITE.platform}. ` +
          `Я говорю с владельцем или руководителем «${name}»? Удобно сейчас пару минут?`,
      },
      {
        heading: 'Зачем звоню',
        text:
          `${SITE.platform} — площадка заявок на спецтехнику по всей России. ` +
          `${PLATFORM_PROMISE}: ${PLATFORM_PROMISE_DETAIL.charAt(0).toLowerCase()}${PLATFORM_PROMISE_DETAIL.slice(1)} ` +
          `Мы увидели вашу компанию на карте${where(p)} и уже сделали вам страницу на площадке. ` +
          `Заказчики смогут заказывать технику у вас напрямую. Откройте, пока говорим: ${input.previewUrl}`,
      },
      {
        heading: 'Что на странице',
        text:
          'Название, город, ваша техника и кнопка «Заказать технику» — заявка сразу уходит к вам. ' +
          'Всё с вашей карточки, ничего не придумано. Телефон покажем только с вашего согласия.',
      },
      {
        heading: 'Как встать на линию',
        text:
          'На странице есть блок «Это ваша компания? Встать на линию бесплатно». По нему — ' +
          'регистрация за минуту, прямо с телефона: имя, номер, вид техники. После этого вы ' +
          'видите заявки рядом с вами и сами называете цену.',
      },
      {
        heading: 'Если «нам не надо»',
        text:
          'Хорошо, без давления. Страница останется закрытой, мы ничего не публикуем и больше ' +
          'не беспокоим. Если передумаете — ссылка у вас, напишите или позвоните нам.',
      },
      {
        heading: 'Итог',
        text:
          'Поблагодарить за разговор. Отметить результат: «Согласился» — публикуем страницу, ' +
          '«Перезвонить» — записать дату, «Отказ» — страница остаётся закрытой.',
      },
    ],
  };
}

export function buildCallScript(p: PageProspect, input: CallScriptInput): CallScript {
  return p.kind === 'provider' ? providerScript(p, input) : siteScript(p, input);
}
