import type { ZodError } from 'zod';

/**
 * Helpers that turn bad client input into a 400 with a readable Russian
 * message instead of a 500.
 */

/** Parses a JSON request body; null when the body is missing or not JSON. */
export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export const INVALID_JSON_MESSAGE = 'Некорректный запрос: ожидались данные в формате JSON';

/** Prisma error code (P2002, P2003…) of a thrown error, if it is one. */
export function prismaErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === 'string' && /^P\d{4}$/.test(code) ? code : null;
  }
  return null;
}

/**
 * First validation problem as one string. Messages written in Russian in the
 * schema are used as is; zod's English defaults are replaced by `fallback`.
 */
export function zodErrorMessage(error: ZodError, fallback = 'Проверьте введённые данные'): string {
  const issue = error.issues[0];
  if (!issue) return fallback;
  return /[А-Яа-яЁё]/.test(issue.message) ? issue.message : fallback;
}
