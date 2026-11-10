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
    // Without Vercel Blob uploads are kept in the database (lib/fileStore.ts).
    blob: set('BLOB_READ_WRITE_TOKEN'),
    // The office of agents: its own SMTP mailbox for letters to companies (never Resend),
    // the 2GIS key for the search, the WhatsApp gateway.
    officeMail: set('OUTREACH_SMTP_USER') && set('OUTREACH_SMTP_PASS'),
    dgis: set('DGIS_API_KEY'),
    whatsappApi: set('GREEN_API_INSTANCE_ID') && set('GREEN_API_TOKEN'),
  };
}
