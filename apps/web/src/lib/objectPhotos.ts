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

export const OBJECT_PHOTOS: ObjectPhoto[] = [];
