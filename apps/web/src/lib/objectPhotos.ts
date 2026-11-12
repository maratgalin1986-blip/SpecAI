// Photos from real job sites, sent by clients and executors and approved by
// the owner (he forwards them to the site session, which adds them here).
// Files live in public/images/objects/. Empty list: the block is hidden.

export interface ObjectPhoto {
  /** Path under /public, e.g. /images/objects/2026-10-trench.jpg */
  src: string;
  /** What is in the photo, without names or phone numbers. */
  caption: string;
  stage?: 'before' | 'after';
  /** «Экскаватор-погрузчик», «Автовышка»… */
  machine?: string;
}

export const OBJECT_PHOTOS: ObjectPhoto[] = [
  {
    src: '/images/objects/2026-11-avtovyshka-stela.jpg',
    caption: 'Автовышка у въездной стелы Тукаевского района: работы на высоте',
    machine: 'Автовышка',
  },
  {
    src: '/images/objects/2026-11-avtovyshka-park.jpg',
    caption: 'Обслуживание аттракциона в парке: люлька автовышки у башни',
    machine: 'Автовышка',
  },
  {
    src: '/images/objects/2026-11-avtovyshka-kran-zavod.jpg',
    caption: 'Автовышка и автокран работают вместе на силосах завода',
    machine: 'Автовышка',
  },
  {
    src: '/images/objects/2026-11-avtovyshka-fasad-ceha.jpg',
    caption: 'Монтаж оборудования на фасаде цеха с автовышки',
    machine: 'Автовышка',
  },
  {
    src: '/images/objects/2026-11-avtovyshka-v-cehe.jpg',
    caption: 'Работы под кровлей цеха: автовышка внутри помещения',
    machine: 'Автовышка',
  },
];
