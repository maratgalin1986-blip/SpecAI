/**
 * Вход машиниста в приложение из формы «Машинисты»: e-mail и временный
 * пароль отправляются, только когда вход создаётся или меняется. Если
 * у машиниста уже есть вход с тем же e-mail и пароль не введён, вход не
 * трогаем — иначе правка телефона сбрасывала бы машинисту пароль.
 */
export type OperatorLogin =
  { ok: true; login: { email: string; password: string } | null } | { ok: false; error: string };

export function operatorLogin(
  form: { email: string; password: string },
  savedEmail?: string | null,
): OperatorLogin {
  const email = form.email.trim();
  if (!email) return { ok: true, login: null };
  const sameLogin = Boolean(savedEmail) && email.toLowerCase() === savedEmail!.trim().toLowerCase();
  if (sameLogin && form.password === '') return { ok: true, login: null };
  if (form.password.length < 8) {
    return { ok: false, error: 'Временный пароль — не короче 8 символов' };
  }
  return { ok: true, login: { email, password: form.password } };
}
