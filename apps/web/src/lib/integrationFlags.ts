/**
 * Which integrations are switched on: yes/no only, never a value. Lets a
 * session without Vercel access tell the owner exactly what is missing.
 */
export function integrationFlags(env: NodeJS.ProcessEnv = process.env) {
  const set = (name: string) => Boolean(env[name]?.trim());
  return {
    ai: set('ANTHROPIC_API_KEY'),
    email: set('RESEND_API_KEY') && set('EMAIL_FROM'),
    telegram: set('TELEGRAM_BOT_TOKEN') && set('TELEGRAM_CHAT_ID'),
    cronSecret: set('CRON_SECRET'),
    files: set('BLOB_READ_WRITE_TOKEN'),
  };
}
