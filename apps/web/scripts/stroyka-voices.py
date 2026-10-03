#!/usr/bin/env python3
"""Records the /stroyka characters' lines with Piper (free neural TTS).

Voices: ru_RU «dmitri» and «denis» (medium), both trained on CC0 data
(https://huggingface.co/rhasspy/piper-voices). Comic «#@%&!» runs become a
1 kHz TV beep. Output: public/audio/stroyka/<key>.mp3, mono, 40 kbit/s.

Run from apps/web (needs `pip install piper-tts`, ffmpeg and the two voice
files in VOICE_DIR):
    npx tsx scripts/stroyka-voice-lines.ts > /tmp/stroyka-lines.json
    python3 scripts/stroyka-voices.py /tmp/stroyka-lines.json
Existing files are kept; pass --force to record everything again.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import wave

VOICE_DIR = os.environ.get("PIPER_VOICES", "/tmp/claude-0/piper")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "audio", "stroyka")

# voice, length scale (>1 slower), pitch factor (<1 lower)
STYLE = {
    "mihalych": ("dmitri", 1.08, 0.93),  # the foreman: low, unhurried
    "rinat": ("denis", 0.94, 1.0),  # operator: quick
    "ildar": ("denis", 1.1, 0.9),  # crane operator: low and calm
    "worker": ("dmitri", 0.98, 1.05),
}

CENSORED = re.compile(r"[#@%&$*!]*[#@%&$*][#@%&$*!]*")
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿️‍]")


def speakable(text: str) -> str:
    """Makes prices and the brand readable for the TTS."""
    t = EMOJI.sub(" ", text)
    t = re.sub(r"(\d)[\s ](\d{3})\b", r"\1\2", t)  # 3 300 → 3300
    t = t.replace("₽/ч", " рублей в час").replace("₽", " рублей")
    t = t.replace("СпецПласт16", "СпецПласт шестнадцать")
    t = t.replace("/", " ")
    return re.sub(r"\s+", " ", t).strip()


def synth(text: str, voice: str, length: float, path: str) -> None:
    model = os.path.join(VOICE_DIR, f"ru_RU-{voice}-medium.onnx")
    subprocess.run(
        [sys.executable, "-m", "piper", "-m", model, "-f", path, "--length-scale", str(length)],
        input=text.encode(),
        check=True,
        capture_output=True,
    )


def beep(path: str, rate: int) -> None:
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
         f"sine=frequency=1000:duration=0.38:sample_rate={rate}",
         "-af", "volume=0.25,afade=t=in:d=0.01,afade=t=out:st=0.36:d=0.02", "-ac", "1", path],
        check=True,
    )


def record(item: dict, tmp: str) -> str:
    voice, length, pitch = STYLE[item["speaker"]]
    parts, pos, n = [], 0, 0
    text = item["text"]
    pieces = []
    for m in CENSORED.finditer(text):
        pieces.append(("say", text[pos:m.start()]))
        pieces.append(("beep", ""))
        pos = m.end()
    pieces.append(("say", text[pos:]))
    for kind, chunk in pieces:
        path = os.path.join(tmp, f"{n}.wav")
        n += 1
        if kind == "beep":
            beep(path, 22050)
        else:
            chunk = speakable(chunk)
            if not re.search(r"\w", chunk):
                continue
            synth(chunk, voice, length, path)
        parts.append(path)
    listing = os.path.join(tmp, "list.txt")
    with open(listing, "w") as f:
        f.writelines(f"file '{p}'\n" for p in parts)
    out = os.path.join(OUT_DIR, f"{item['key']}.mp3")
    # Pitch without changing speed: resample, then stretch back.
    af = f"asetrate=22050*{pitch},aresample=22050,atempo={1 / pitch:.4f}," if pitch != 1 else ""
    af += "highpass=f=80,loudnorm=I=-18:TP=-2"
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", listing,
         "-af", af, "-ac", "1", "-ar", "22050", "-b:a", "40k", out],
        check=True,
    )
    return out


def main() -> None:
    items = json.load(open(sys.argv[1]))
    force = "--force" in sys.argv
    os.makedirs(OUT_DIR, exist_ok=True)
    keys = {i["key"] for i in items}
    for name in os.listdir(OUT_DIR):  # drop clips of removed lines
        if name.endswith(".mp3") and name[:-4] not in keys:
            os.remove(os.path.join(OUT_DIR, name))
    done = 0
    for item in items:
        out = os.path.join(OUT_DIR, f"{item['key']}.mp3")
        if os.path.exists(out) and not force:
            continue
        with tempfile.TemporaryDirectory() as tmp:
            record(item, tmp)
        done += 1
        if done % 25 == 0:
            print(f"{done} recorded", flush=True)
    print(f"done: {done} new, {len(items)} total")


if __name__ == "__main__":
    main()
