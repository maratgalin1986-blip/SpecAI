// Sends a file to the owner's own chat with the site's bot — the same bot
// and chat as lib/notify.ts (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID).

/**
 * The owner's private chat, or null. A group's id is negative: the database
 * copy goes to the owner alone, never to a group.
 */
export function ownerPrivateChatId(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const chatId = env.TELEGRAM_CHAT_ID?.trim() ?? '';
  return env.TELEGRAM_BOT_TOKEN && /^\d+$/.test(chatId) ? chatId : null;
}

/** Resolves to whether Telegram accepted the file. Never throws. */
export async function sendOwnerDocument(
  file: Buffer,
  name: string,
  caption: string,
  timeoutMs: number,
): Promise<boolean> {
  const chatId = ownerPrivateChatId();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!chatId || !token || timeoutMs <= 0) return false;
  const form = new FormData();
  form.set('chat_id', chatId);
  form.set('caption', caption);
  form.set('disable_content_type_detection', 'true');
  form.set(
    'document',
    new Blob([new Uint8Array(file)], { type: 'application/octet-stream' }),
    name,
  );
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: form,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) console.error(`[backup] sendDocument answered ${response.status}`);
    return response.ok;
  } catch (error) {
    // The address holds the bot token, so only the kind of the error is logged.
    console.error('[backup] sendDocument failed', error instanceof Error ? error.name : 'error');
    return false;
  }
}
