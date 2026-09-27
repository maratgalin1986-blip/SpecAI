import { createToken } from '@/lib/tokens';
import { sendEmail, type SendEmailResult } from '@/lib/email';
import { emailVerify, getEmailBaseUrl } from '@/lib/emailTemplates';

export const EMAIL_VERIFY_TTL_MINUTES = 24 * 60;

/** Создаёт токен подтверждения email и отправляет письмо со ссылкой. */
export async function sendVerificationEmail(user: {
  id: string;
  email: string;
}): Promise<SendEmailResult> {
  const token = await createToken(user.id, 'EMAIL_VERIFY', EMAIL_VERIFY_TTL_MINUTES);
  const verifyUrl = `${getEmailBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  return sendEmail({ to: user.email, ...emailVerify({ verifyUrl }) });
}
