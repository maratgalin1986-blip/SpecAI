// Optional Telegram notification about new callback requests. Set
// TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable; otherwise it's a no-op.
// Resolves to whether Telegram accepted the message. Messages from preview
// deployments (they share the bot) are marked so tests never pass for clients.
export async function notifyTelegram(message: string): Promise<boolean> {
  const text =
    process.env.VERCEL_ENV === 'preview' ? `🧪 ТЕСТ С ПРЕВЬЮ, не клиент\n${message}` : message;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (error) {
    // The lead is already saved; a failed notification must not fail the request.
    console.error('Telegram notification failed', error);
    return false;
  }
}
