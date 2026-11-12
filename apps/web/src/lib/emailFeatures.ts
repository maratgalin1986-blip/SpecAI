// What the site may offer by e-mail. While the mail integration is off
// (lib/integrationFlags.ts: no RESEND_API_KEY or EMAIL_FROM) no letter leaves
// the server, so the pages must not promise a reset link or a weekly letter.

import { integrationFlags } from './integrationFlags';
import { SITE } from './site';

export interface EmailFeatures {
  /** «Забыли пароль?»: a reset link by e-mail. */
  passwordRecovery: boolean;
  /** The «Заявки рядом за неделю» checkbox at sign-up. */
  weeklyDigest: boolean;
}

export function emailFeatures(env: NodeJS.ProcessEnv = process.env): EmailFeatures {
  const on = integrationFlags(env).email;
  return { passwordRecovery: on, weeklyDigest: on };
}

/** Shown instead of «мы отправили письмо» while letters are not sent. */
export const PASSWORD_RECOVERY_OFF_MESSAGE = `Письма сейчас не отправляются, поэтому ссылку для сброса пароля прислать не можем. Позвоните диспетчеру: ${SITE.phone}`;
