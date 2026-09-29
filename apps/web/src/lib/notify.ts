// Optional Telegram notification about new callback requests. Set
// TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable; otherwise it's a no-op.
// Resolves to true only when Telegram accepted the message.
export async function notifyTelegram(text: string): Promise<boolean> {
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
    if (!response.ok) console.error('Telegram notification rejected', response.status);
    return response.ok;
  } catch (error) {
    // A failed notification must not fail the request that triggered it.
    console.error('Telegram notification failed', error);
    return false;
  }
}
