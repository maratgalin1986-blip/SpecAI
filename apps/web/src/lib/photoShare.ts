// Photos from the job sites, sent by clients (with an optional note) and by
// executors (photos only). They go to the owner's Telegram for review and are
// never published automatically. Pure helpers, no I/O.

export type PhotoRole = 'client' | 'executor';
/** Before the job starts or after it is done: we ask twice, gently. */
export type PhotoStage = 'before' | 'after';

export const PHOTO_MAX_FILES = 3;
export const PHOTO_NOTE_MAX = 300;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function isPhotoType(type: string): boolean {
  return PHOTO_TYPES.includes(type);
}

export interface PhotoSubmission {
  role: PhotoRole;
  stage?: PhotoStage;
  consent: boolean;
  /** Clients only; executors send photos without a comment. */
  note?: string;
  page?: string;
  fileCount: number;
}

/** The first problem with a submission, in Russian, or null if it is fine. */
export function photoSubmissionError(input: PhotoSubmission): string | null {
  if (input.role !== 'client' && input.role !== 'executor') return 'Неизвестный отправитель';
  if (input.stage && input.stage !== 'before' && input.stage !== 'after') return 'Неизвестный этап';
  if (!input.consent) return 'Нужно согласие на публикацию фото';
  if (input.fileCount < 1) return 'Выберите хотя бы одно фото';
  if (input.fileCount > PHOTO_MAX_FILES) return `Не больше ${PHOTO_MAX_FILES} фото за раз`;
  if (input.role === 'executor' && input.note) return 'Исполнители отправляют только фото';
  if ((input.note ?? '').length > PHOTO_NOTE_MAX) return 'Комментарий слишком длинный';
  return null;
}

/** Telegram text for the owner: who sent it, where from, the links. */
export function photoTelegramText(input: PhotoSubmission, urls: string[]): string {
  const who = input.role === 'client' ? 'клиент' : 'исполнитель';
  const when =
    input.stage === 'after' ? ', после работ' : input.stage === 'before' ? ', до начала работ' : '';
  const lines = [`📷 Фото с объекта (${who}${when}) — проверьте перед публикацией`];
  if (input.page) lines.push(`Страница: ${input.page}`);
  const note = input.role === 'client' ? input.note?.trim() : '';
  if (note) lines.push(`Комментарий: ${note}`);
  lines.push(...urls.map((url, index) => `${index + 1}. ${url}`));
  lines.push('Согласие на публикацию получено.');
  return lines.join('\n');
}

/** What we say when asking: short, with thanks and the reason. */
export const PHOTO_PROMPTS: Record<
  PhotoRole,
  Record<PhotoStage, { link: string; text: string }>
> = {
  client: {
    before: {
      link: '📷 Можно фото участка до начала работ? По желанию',
      text: 'Если не трудно, сфотографируйте участок: машинист заранее увидит подъезд и место, а после работ покажем «до и после». Спасибо!',
    },
    after: {
      link: '📷 Поделитесь фото результата — будем благодарны',
      text: 'Спасибо, что выбрали СпецПласт16! Если работа понравилась, пришлите пару фото результата: с вашего согласия покажем их на сайте, без имён и телефонов. Это очень помогает нам.',
    },
  },
  executor: {
    before: {
      link: '📷 Фото объекта до начала работ',
      text: 'Сфотографируйте место до начала работ — пригодится для «до и после».',
    },
    after: {
      link: '📷 Фото после работ',
      text: 'Покажите результат: фото техники в работе и готового объекта. Спасибо!',
    },
  },
};

/** Page the dispatcher sends to a client after the job. */
export const PHOTO_AFTER_PATH = '/foto';
