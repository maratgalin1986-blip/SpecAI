// Photos from the job sites, sent by clients (with an optional note) and by
// executors (photos only). They go to the owner's Telegram for review and are
// never published automatically. Pure helpers, no I/O.

export type PhotoRole = 'client' | 'executor';

export const PHOTO_MAX_FILES = 3;
export const PHOTO_NOTE_MAX = 300;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function isPhotoType(type: string): boolean {
  return PHOTO_TYPES.includes(type);
}

export interface PhotoSubmission {
  role: PhotoRole;
  consent: boolean;
  /** Clients only; executors send photos without a comment. */
  note?: string;
  page?: string;
  fileCount: number;
}

/** The first problem with a submission, in Russian, or null if it is fine. */
export function photoSubmissionError(input: PhotoSubmission): string | null {
  if (input.role !== 'client' && input.role !== 'executor') return 'Неизвестный отправитель';
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
  const lines = [`📷 Фото с объекта (${who}) — проверьте перед публикацией`];
  if (input.page) lines.push(`Страница: ${input.page}`);
  const note = input.role === 'client' ? input.note?.trim() : '';
  if (note) lines.push(`Комментарий: ${note}`);
  lines.push(...urls.map((url, index) => `${index + 1}. ${url}`));
  lines.push('Согласие на публикацию получено.');
  return lines.join('\n');
}
