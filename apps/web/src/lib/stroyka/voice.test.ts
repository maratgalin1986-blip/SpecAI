import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LINES, RADIO_PAIRS } from './lines';
import { RECORDED_SPEAKERS, spokenText, voiceKey } from './voice';
import { VOICE_CLIPS } from './voiceClips';

const audioDir = join(__dirname, '../../../public/audio/stroyka');

describe('recorded /stroyka voices', () => {
  it('ignores emojis and extra spaces when matching a line', () => {
    expect(spokenText('😂  Каска нужна  ')).toBe('Каска нужна');
    expect(voiceKey('Каска нужна 😂')).toBe(voiceKey('Каска нужна'));
  });

  // Fails when a line was edited or added without re-recording:
  //   npx tsx scripts/stroyka-voice-lines.ts > /tmp/l.json && python3 scripts/stroyka-voices.py /tmp/l.json
  it('has a recording for every line of the recorded characters', () => {
    const texts = [
      ...RECORDED_SPEAKERS.flatMap((s) => LINES[s].map((l) => l.text)),
      ...RADIO_PAIRS.flatMap((p) => [
        ...((RECORDED_SPEAKERS as readonly string[]).includes(p.a) ? [p.aText] : []),
        ...((RECORDED_SPEAKERS as readonly string[]).includes(p.b) ? [p.bText] : []),
      ]),
    ];
    const missing = texts.filter((t) => !VOICE_CLIPS[voiceKey(t)]);
    expect(missing).toEqual([]);
    const files = new Set(Object.values(VOICE_CLIPS).flat());
    const absent = [...files].filter((f) => !existsSync(join(audioDir, `${f}.mp3`)));
    expect(absent).toEqual([]);
  });
});
