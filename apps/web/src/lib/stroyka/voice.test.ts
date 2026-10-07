import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CREW } from './crew';
import { LINES, lineTexts, RADIO_PAIRS } from './lines';
import { INNER_LINES } from './lines/inner';
import { RECORDED_SPEAKERS, spokenText, voiceKey } from './voice';
import { VOICE_CLIPS } from './voiceClips';

const audioDir = join(__dirname, '../../../public/audio/stroyka');

describe('recorded /stroyka voices', () => {
  it('ignores emojis and extra spaces when matching a line', () => {
    expect(spokenText('😂  Каска нужна  ')).toBe('Каска нужна');
    expect(voiceKey('Каска нужна 😂')).toBe(voiceKey('Каска нужна'));
  });

  // Fails when a line was edited or added without re-recording:
  //   npx tsx scripts/stroyka-voice-lines.ts > /tmp/l.json
  //   python3 scripts/stroyka-voices-hybrid.py /tmp/l.json --refs <voices> --asr <model>
  it('has a recording for every line of the recorded characters', () => {
    const texts = [
      ...RECORDED_SPEAKERS.flatMap((s) => LINES[s].flatMap(lineTexts)),
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

  it('records the women too, so Света and Алсу never fall back to the browser voice', () => {
    expect(RECORDED_SPEAKERS).toEqual(expect.arrayContaining(['sveta', 'alsu']));
    for (const speaker of ['sveta', 'alsu'] as const) {
      const texts = LINES[speaker].flatMap(lineTexts);
      expect(texts.length).toBeGreaterThan(50);
      expect(texts.filter((t) => !VOICE_CLIPS[voiceKey(t)])).toEqual([]);
    }
  });

  it('has a recording for the crew by name and for every voiced inner line', () => {
    const crew = Object.values(CREW).flatMap((m) => m.lines);
    expect(crew.filter((t) => !VOICE_CLIPS[voiceKey(t)])).toEqual([]);
    const inner = INNER_LINES.filter((l) => l.voiced).map((l) => l.text);
    expect(inner.filter((t) => !VOICE_CLIPS[voiceKey(t)])).toEqual([]);
  });
});
