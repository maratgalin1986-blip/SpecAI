/**
 * JWT, выданный до последней смены пароля, недействителен.
 * iat в секундах, поэтому сравниваем на уровне секунд: вход в ту же секунду,
 * что и сброс пароля, остаётся валидным.
 */
export function isTokenIssuedBeforePasswordChange(
  iat: number | undefined,
  passwordChangedAt: Date | null | undefined,
): boolean {
  if (typeof iat !== 'number' || !passwordChangedAt) return false;
  return Math.floor(passwordChangedAt.getTime() / 1000) > iat;
}
