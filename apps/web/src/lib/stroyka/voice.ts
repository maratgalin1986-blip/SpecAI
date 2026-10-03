// Recorded voices for the /stroyka characters. The male characters' written
// lines are pre-recorded with the free neural TTS Piper (voices «Дмитрий» and
// «Денис», CC0) by scripts/stroyka-voices.py into /audio/stroyka/<key>.mp3.
// A line is matched by its text, so any caller of sp:dialog gets the recording
// for free; lines without one (live answers, the women's lines) fall back to
// the browser's speechSynthesis in lib/soundEngine.ts.

import { stripEmoji } from '@/lib/stripEmoji';

/** Characters with recorded lines (the two CC0 Piper voices are male). */
export const RECORDED_SPEAKERS = ['mihalych', 'rinat', 'ildar', 'worker'] as const;

export const radioClipKey = (n: number, side: 'a' | 'b') => `radio-${n}-${side}`;

/** Text as spoken: no emojis, single spaces. */
export function spokenText(text: string): string {
  return stripEmoji(text).replace(/\s+/g, ' ').trim();
}

/** FNV-1a of the spoken text, the key of the clip manifest. */
export function voiceKey(text: string): string {
  let h = 0x811c9dc5;
  for (const ch of spokenText(text)) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export const clipUrl = (key: string) => `/audio/stroyka/${key}.mp3`;

let manifest: Promise<Record<string, string[]>> | null = null;

/**
 * The recordings of a line, played back to back (a template line is an
 * opener and a remark), or null. The manifest is loaded on first use, so
 * pages without characters never download it.
 */
export async function clipsFor(text: string): Promise<string[] | null> {
  manifest ??= import('./voiceClips').then((m) => m.VOICE_CLIPS).catch(() => ({}));
  const keys = (await manifest)[voiceKey(text)];
  return keys ? keys.map(clipUrl) : null;
}
