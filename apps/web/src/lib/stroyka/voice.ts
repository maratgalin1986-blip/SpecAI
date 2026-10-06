// Recorded voices for the /stroyka characters. Every written line is
// pre-recorded by scripts/stroyka-voices-hybrid.py into
// /audio/stroyka/<key>.mp3: Qwen3-TTS VoiceDesign (Apache-2.0) designed one
// synthetic voice per character, and Chatterbox Multilingual (MIT) speaks
// each line in that voice with the line's emotion. A line is matched by its
// text, so any caller of sp:dialog gets the recording for free; lines without
// one (live answers with the visitor's name, prices of the day) fall back to
// the browser's speechSynthesis in lib/soundEngine.ts.

import { stripEmoji } from '@/lib/stripEmoji';

/** Characters with recorded lines: all of them, Света and Алсу included. */
export const RECORDED_SPEAKERS = ['mihalych', 'rinat', 'ildar', 'worker', 'sveta', 'alsu'] as const;

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
