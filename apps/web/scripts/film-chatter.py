#!/usr/bin/env python3
"""Mixes the crew's voices into the opening film of /stroyka (owner,
2026-10-03: «при заставке больше голосов людей, реальные фразы со стройки на
фоне»). Phrases a real site hears all day — «Вира помалу!», «Майна!», «Бетон
пришёл!» — recorded with Piper (see stroyka-voices.py), set at a distance
(quieter, duller, a little echo) or over the radio, panned left and right, and
laid under the film's music. The video stream is copied as is.

Run from apps/web with the films WITHOUT voices as input (keep them: running
this on its own output would add the voices twice):
    python3 scripts/film-chatter.py <dir with stroyka-film.mp4 and stroyka-film-sm.mp4>
"""

import importlib.util
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("voices", os.path.join(HERE, "stroyka-voices.py"))
voices = importlib.util.module_from_spec(spec)
spec.loader.exec_module(voices)

FILM_DIR = os.path.join(HERE, "..", "public", "film")

# (start in s, speaker, text, how it sounds: near / far / radio, pan -1…1)
LINES = [
    (1.2, "ildar", "Внимание, кран работает!", "far", -0.5),
    (3.4, "worker", "Вира помалу! Вира!", "near", 0.4),
    (6.0, "rinat", "Сдаёт назад, отойди от машины!", "far", 0.6),
    (8.3, "crew-armen", "Стропы проверил, цепляй.", "near", -0.3),
    (10.6, "ildar", "Первый, я крановщик. Груз на крюке.", "radio", 0.0),
    (13.2, "mihalych", "Бетон пришёл, встречайте миксер!", "far", -0.6),
    (15.6, "crew-rustam", "Давай, давай, ещё немножко… Стоп!", "near", 0.3),
    (18.4, "crew-aidar", "Щебень куда сыпать?", "far", 0.7),
    (19.9, "mihalych", "Вон туда, к забору!", "far", -0.4),
    (22.6, "worker", "Майна! Майна потихоньку.", "near", -0.2),
    (25.2, "crew-nurlan", "Самосвал на въезде, открывай ворота!", "far", 0.5),
    (27.8, "rinat", "Әйдә, әйдә, малайлар!", "near", -0.5),
    (30.4, "mihalych", "Каски надели все? Под стрелой не стоим.", "radio", 0.0),
    (33.0, "crew-elchin", "Плиту держи, держи… Пошла!", "near", 0.4),
    (35.6, "crew-armen", "Уровень дай, проверим отметку.", "far", -0.6),
    (38.0, "worker", "Без булдырабыз!", "near", 0.2),
    (40.2, "crew-nikolai", "Перекур пять минут, мужики. Чайник поставил.", "far", -0.3),
]

SOUND = {
    # Next to the camera, but still under the music.
    "near": "volume=0.85",
    # Across the site: quieter, duller, a short slap-back off the buildings.
    "far": "lowpass=f=2600,aecho=0.8:0.6:90:0.25,volume=0.8",
    # The foreman's radio: narrow band, a little crunch.
    "radio": "highpass=f=450,lowpass=f=2800,acrusher=bits=10:mix=0.3,volume=0.7",
}


def run(cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def main() -> None:
    src = sys.argv[1]
    with tempfile.TemporaryDirectory() as tmp:
        voices.OUT_DIR = tmp
        clips = []
        for n, (_, speaker, text, _, _) in enumerate(LINES):
            with tempfile.TemporaryDirectory() as work:
                clips.append(voices.record({"key": f"l{n}", "speaker": speaker, "text": text}, work))
        for name in ("stroyka-film.mp4", "stroyka-film-sm.mp4"):
            cmd = ["ffmpeg", "-loglevel", "error", "-y", "-i", os.path.join(src, name)]
            graph = []
            for n, clip in enumerate(clips):
                start, _, _, kind, pan = LINES[n]
                cmd += ["-i", clip]
                left, right = (1 - pan) / 2, (1 + pan) / 2
                ms = int(start * 1000)
                graph.append(
                    f"[{n + 1}:a]aresample=44100,{SOUND[kind]},"
                    f"pan=stereo|c0={left:.2f}*c0|c1={right:.2f}*c0,adelay={ms}|{ms}[v{n}]"
                )
            mix = "".join(f"[v{n}]" for n in range(len(clips)))
            # The music steps back a little while someone speaks, as in a film mix.
            graph.append(f"{mix}amix=inputs={len(clips)}:normalize=0,asplit[vo][key]")
            graph.append(
                "[0:a][key]sidechaincompress=threshold=0.03:ratio=3:attack=30:release=500[bed]"
            )
            graph.append("[bed][vo]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]")
            out = os.path.join(FILM_DIR, name)
            run(cmd + ["-filter_complex", ";".join(graph), "-map", "0:v", "-map", "[a]",
                       "-c:v", "copy", "-c:a", "aac", "-b:a", "112k", "-movflags", "+faststart", out])
            print(name, os.path.getsize(out))


if __name__ == "__main__":
    main()
