#!/usr/bin/env python3
"""Records the /stroyka characters' lines in their own synthetic voices.

The hybrid the owner chose (2026-10-04): Qwen3-TTS VoiceDesign (Apache-2.0,
https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign) designed one
voice per character from a text description, once, into a short reference
clip (REFS/<speaker>.wav; the descriptions and seeds are in REFS/voices.json).
Chatterbox Multilingual (MIT, https://huggingface.co/ResembleAI/chatterbox)
then speaks every line in that voice, with the line's emotion set by
`exaggeration` and `cfg_weight`. The voices are synthetic and belong to no
real person; Chatterbox adds Resemble's inaudible PerTh «AI-made» watermark.

Text preparation (STRESS, LETTERS, speakable) comes from stroyka-voices.py.
Comic «#@%&!» runs stay a 1 kHz TV beep. Output: public/audio/stroyka/<key>.mp3,
mono, 24 kHz, 48 kbit/s, lightly loudness-normalised, the same file names
as before, so lib/stroyka/voiceClips.ts and the tests keep working.

Quality control (--asr): every take is transcribed by an open Russian ASR
(Vosk small-ru Zipformer through sherpa-onnx, Apache-2.0); a take with under
80 % of the words heard (native words and names the ASR cannot know are not
counted), or longer than 2.5x the expected length (a hallucination), is
recorded again with another seed, up to 3 takes; the best one is kept.
Every take is logged to a CSV.

Run from apps/web (Python with chatterbox-tts, num2words; sherpa-onnx for
--asr; ffmpeg):
    npx tsx scripts/stroyka-voice-lines.ts > /tmp/stroyka-lines.json
    OMP_WAIT_POLICY=PASSIVE python3 scripts/stroyka-voices-hybrid.py /tmp/stroyka-lines.json \
        --refs <dir with <speaker>.wav> --asr --state <dir> [--force] [--threads 2] [--shard 0/2]
Existing files are kept (a line that only moved reuses its file); --force
records everything again. Progress is checkpointed in --state, so a run that
was interrupted resumes where it stopped (also with --force).
"""

import argparse
import csv
import hashlib
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

os.environ.setdefault("OMP_WAIT_POLICY", "PASSIVE")

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("piper_voices", os.path.join(HERE, "stroyka-voices.py"))
base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(base)
STRESS, LETTERS, speakable, CENSORED = base.STRESS, base.LETTERS, base.speakable, base.CENSORED
OUT_DIR = base.OUT_DIR
SR = 24000

# Emotion by mood (lib/stroyka/mood.ts): exaggeration, cfg_weight, temperature.
# Higher exaggeration = livelier and faster; lower cfg = looser, slower pace.
MOOD = {
    "neutral": (0.55, 0.5, 0.8),
    "happy": (0.7, 0.4, 0.8),
    "laugh": (0.8, 0.35, 0.85),
    "proud": (0.65, 0.45, 0.8),
    "angry": (0.75, 0.4, 0.8),
    "surprised": (0.75, 0.4, 0.85),
    "worried": (0.5, 0.5, 0.75),
    "tired": (0.3, 0.6, 0.7),
    "thinking": (0.4, 0.55, 0.7),
    "radio": (0.5, 0.5, 0.75),
}
# The character's temperament on top (the same idea as STYLE in stroyka-voices.py).
TEMPER = {
    "mihalych": -0.05,  # the foreman: unhurried
    "ildar": -0.05,  # crane operator: calm
    "rinat": 0.05,  # operator: quick, cheerful
    "sveta": 0.05,  # logist: energetic
    "crew-armen": 0.05,  # lively
    "crew-elchin": 0.05,  # quick
    "crew-nurlan": -0.05,  # measured
    "crew-nikolai": -0.1,  # old, slow
}


def emotion(item: dict) -> tuple:
    """Chatterbox settings for a line: its mood, its kind, the speaker."""
    e, c, t = MOOD.get(item.get("mood") or "neutral", MOOD["neutral"])
    kind = item.get("kind")
    if kind == "business":  # clear and calm, a smile at most
        e, c, t = min(e, 0.55), 0.5, 0.7
    elif kind == "opener":  # joined to remarks of every kind: neutral
        e, c, t = 0.5, 0.5, 0.75
    elif kind == "inner":  # a bit of the character's own life: warm, personal
        e, c, t = min(e, 0.6), 0.45, 0.8
    e += TEMPER.get(item["speaker"], 0)
    return round(min(max(e, 0.25), 0.9), 2), c, t


# Words that read better spelled out (numbers that need a case).
TEXT_FIX = {"2019-м": "две тысячи девятнадцатом"}
GENITIVE = {"от", "до", "около", "свыше", "более", "менее", "из"}
FEMININE = re.compile(r"^(тонн|минут|смен|машин|недел|тысяч)", re.I)


def numbers(text: str) -> str:
    """Digits to Russian words, in the case the neighbours want."""
    from num2words import num2words

    def say(m: re.Match) -> str:
        before = text[: m.start()].split()
        after = text[m.end():].split()
        kw = {"lang": "ru"}
        if before and before[-1].lower() in GENITIVE:
            kw["case"] = "genitive"
        if after and FEMININE.match(after[0]):
            kw["gender"] = "f"
        return num2words(int(m.group()), **kw)

    return re.sub(r"\d+", say, text)


def speech_text(text: str) -> str:
    """What Chatterbox gets: speakable() plus numbers in words and pauses at dashes."""
    for k, v in TEXT_FIX.items():
        text = text.replace(k, v)
    t = numbers(speakable(text))
    t = t.replace(" — ", ", ").replace(" – ", ", ")
    return t


# ---------------------------------------------------------------- ASR check
SHERPA = os.environ.get("SHERPA_PATH", "/usr/local/lib/python3.11/dist-packages")
ASR_MODEL = os.environ.get("ASR_MODEL", "")
# Native words and names the Russian ASR vocabulary cannot know: not counted.
NAMES = {
    "ринат", "ильдар", "алсу", "михалыч", "айдар", "нурлан", "эльчин", "рустам", "армен", "света",
    "свету", "свете", "светы", "ринатака", "ака", "джан", "апа", "фергане", "мензелинском",
    "елабуге", "нижнекамске", "челнах", "челнов", "челны", "боровецкое", "сидоровку", "тукаевский",
    "спецпласт", "джей", "си", "би", "уфе", "ахпер", "ара", "гардаш", "армуды", "эчпочмак",
    "чакчак", "казана", "джейсиби",
}
NATIVE = {w for v in STRESS.values() for w in re.findall(r"\w+", v.replace("\u0301", "").lower())}
NATIVE -= {"без", "здорово", "бе", "эш", "мин", "сак", "сау"}


def words(t: str) -> list:
    t = t.lower().replace("ё", "е").replace("\u0301", "").replace("-", "")
    return re.findall(r"[a-zа-я0-9]+", t)


IGNORE = {w for x in NAMES | NATIVE for w in words(x)}


class Asr:
    def __init__(self, model_dir: str):
        sys.path.append(SHERPA)
        import sherpa_onnx  # noqa: E402

        m = model_dir.rstrip("/") + "/"
        self.rec = sherpa_onnx.OfflineRecognizer.from_transducer(
            encoder=m + "am/encoder.int8.onnx", decoder=m + "am/decoder.onnx",
            joiner=m + "am/joiner.int8.onnx", tokens=m + "lang/tokens.txt", num_threads=1,
            sample_rate=16000, decoding_method="greedy_search")

    def transcribe(self, samples) -> str:
        s = self.rec.create_stream()
        s.accept_waveform(16000, samples)
        self.rec.decode_stream(s)
        return s.result.text.lower()

    @staticmethod
    def score(ref: str, hyp: str) -> tuple:
        """Words of ref heard in hyp, in order (LCS), native words left out."""
        r = [w for w in words(ref) if w not in IGNORE]
        h = words(hyp)
        if not r:
            return 1.0, 0, 0
        L = [[0] * (len(h) + 1) for _ in range(len(r) + 1)]
        for i in range(len(r)):
            for j in range(len(h)):
                L[i + 1][j + 1] = L[i][j] + 1 if r[i] == h[j] else max(L[i][j + 1], L[i + 1][j])
        return L[-1][-1] / len(r), L[-1][-1], len(r)


def expected_seconds(say: str, beeps: int) -> float:
    """Rough length of a line: ~5 syllables a second, a beep is 0.4 s."""
    syll = len(re.findall(r"[аеёиоуыэюяaeiou]", say.lower()))
    return syll / 5.0 + 0.4 * beeps + 0.3


# ---------------------------------------------------------------- recording
def pieces(text: str) -> list:
    out, pos = [], 0
    for m in CENSORED.finditer(text):
        out.append(("say", text[pos:m.start()]))
        out.append(("beep", ""))
        pos = m.end()
    out.append(("say", text[pos:]))
    return [(k, c) for k, c in out if k == "beep" or re.search(r"\w", c)]


def beep_samples():
    import numpy as np

    n = int(0.38 * SR)
    x = 0.25 * np.sin(2 * np.pi * 1000 * np.arange(n) / SR)
    fade = int(0.01 * SR)
    x[:fade] *= np.linspace(0, 1, fade)
    x[-2 * fade:] *= np.linspace(1, 0, 2 * fade)
    return x.astype("float32")


def encode(wav_path: str, out: str) -> None:
    """Trim the silence at the ends, light high-pass and loudness, mp3."""
    trim = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05"
    af = f"{trim},areverse,{trim.replace('0.05', '0.12')},areverse,highpass=f=70,loudnorm=I=-18:TP=-2:LRA=11"
    tmp = out + ".part.mp3"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav_path, "-af", af, "-ac", "1",
                    "-ar", str(SR), "-b:a", "48k", tmp], check=True)
    os.replace(tmp, out)


def to16k(samples):
    import numpy as np
    import librosa

    return librosa.resample(np.asarray(samples, dtype="float32"), orig_sr=SR, target_sr=16000)


def group(key: str) -> str:
    head = key.split("-")
    return "-".join(head[:2]) if head[0] == "crew" else head[0]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("lines")
    ap.add_argument("--refs", required=True, help="dir with <speaker>.wav reference clips")
    ap.add_argument("--state", default=os.path.join(tempfile.gettempdir(), "stroyka-hybrid"))
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--asr", default="", help="Vosk small-ru sherpa-onnx model dir (am/, lang/)")
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--shard", default="0/1")
    ap.add_argument("--only", default="", help="comma-separated speakers or keys")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--attempts", type=int, default=3)
    ap.add_argument("--min-score", type=float, default=0.8)
    args = ap.parse_args()

    import numpy as np
    import soundfile as sf
    import torch

    torch.set_num_threads(args.threads)
    shard, shards = (int(x) for x in args.shard.split("/"))
    items = json.load(open(args.lines))
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(args.state, exist_ok=True)

    # Clips done in this run (resume): key → text fingerprint, from every shard.
    done = {}
    for name in os.listdir(args.state):
        if name.startswith("done-") and name.endswith(".jsonl"):
            for row in open(os.path.join(args.state, name)):
                if row.strip():
                    r = json.loads(row)
                    done[r["key"]] = r["fp"]
    fp = lambda it: hashlib.sha1(f"{it['speaker']}|{it['text']}".encode()).hexdigest()[:12]  # noqa: E731

    if shard == 0 and not args.only and not args.limit:
        keys = {i["key"] for i in items}
        # A line that only moved keeps its recording (same text, same speaker group).
        if not args.force:
            old = {}
            for name in os.listdir(OUT_DIR):
                if name.endswith(".mp3"):
                    k = name[:-4]
                    old.setdefault((group(k), k.rsplit("-", 1)[-1]), []).append(k)
            for item in items:
                out = os.path.join(OUT_DIR, f"{item['key']}.mp3")
                if os.path.exists(out):
                    continue
                for prev in old.get((group(item["key"]), item["key"].rsplit("-", 1)[-1]), []):
                    src = os.path.join(OUT_DIR, f"{prev}.mp3")
                    if os.path.exists(src):
                        shutil.copyfile(src, out)
                        break
        for name in os.listdir(OUT_DIR):  # drop clips of removed lines
            if name.endswith(".mp3") and name[:-4] not in keys:
                os.remove(os.path.join(OUT_DIR, name))

    only = set(filter(None, args.only.split(",")))
    todo = []
    for n, item in enumerate(items):
        if n % shards != shard:
            continue
        if only and item["speaker"] not in only and item["key"] not in only:
            continue
        out = os.path.join(OUT_DIR, f"{item['key']}.mp3")
        if done.get(item["key"]) == fp(item) and os.path.exists(out):
            continue
        if not args.force and os.path.exists(out):
            continue
        todo.append(item)
    todo.sort(key=lambda i: i["speaker"])  # one voice prompt per speaker
    if args.limit:
        todo = todo[: args.limit]
    print(f"shard {args.shard}: {len(todo)} to record", flush=True)
    if not todo:
        return

    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    model = ChatterboxMultilingualTTS.from_pretrained("cpu")
    asr = Asr(args.asr) if args.asr else None
    beep = beep_samples()
    gap = np.zeros(int(0.08 * SR), dtype="float32")
    log_path = os.path.join(args.state, f"log-{shard}.csv")
    new_log = not os.path.exists(log_path)
    log = open(log_path, "a", newline="")
    w = csv.writer(log)
    if new_log:
        w.writerow(["time", "key", "speaker", "kind", "mood", "attempt", "seed", "exaggeration", "cfg",
                    "temperature", "gen_s", "dur_s", "expected_s", "asr_score", "heard", "counted",
                    "verdict", "chosen", "text", "asr_text"])
    done_log = open(os.path.join(args.state, f"done-{shard}.jsonl"), "a")
    speaker = None
    t_start = time.time()
    for n, item in enumerate(todo, 1):
        if item["speaker"] != speaker:
            speaker = item["speaker"]
            model.prepare_conditionals(os.path.join(args.refs, f"{speaker}.wav"), exaggeration=0.5)
        parts = pieces(item["text"])
        said = [speech_text(c) for k, c in parts if k == "say"]
        ref_text = " ".join(said).replace("\u0301", "")
        expected = expected_seconds(ref_text, sum(k == "beep" for k, _ in parts))
        e0, c0, t0 = emotion(item)
        seed0 = int(hashlib.sha1(item["key"].encode()).hexdigest()[:6], 16)
        takes = []
        for attempt in range(args.attempts):
            e = round(max(e0 - 0.08 * attempt, 0.25), 2)
            c = round(min(c0 + 0.05 * attempt, 0.7), 2)
            t = round(max(t0 - 0.05 * attempt, 0.6), 2)
            seed = seed0 + 1000 * attempt
            torch.manual_seed(seed)
            began = time.time()
            chunks = []
            for kind, chunk in parts:
                if kind == "beep":
                    chunks += [gap, beep, gap]
                    continue
                wav = model.generate(speech_text(chunk), language_id="ru", exaggeration=e,
                                     cfg_weight=c, temperature=t)
                chunks.append(wav.squeeze(0).numpy().astype("float32"))
            audio = np.concatenate(chunks)
            gen = time.time() - began
            # Length without the silences Chatterbox sometimes leaves at the ends.
            loud = np.flatnonzero(np.abs(audio) > 0.01)
            dur = (loud[-1] - loud[0]) / SR if len(loud) else 0.0
            score, heard, counted, hyp = 1.0, 0, 0, ""
            if asr:
                hyp = asr.transcribe(to16k(audio))
                score, heard, counted = Asr.score(ref_text, hyp)
            too_long = dur > 2.5 * expected
            too_short = dur < 0.3 * expected
            ok = score >= args.min_score and not too_long and not too_short
            verdict = "ok" if ok else ("too_long" if too_long else "too_short" if too_short else "asr_low")
            takes.append({"audio": audio, "ok": ok, "hyp": hyp, "score": score, "fits": not (too_long or too_short),
                          "row": [time.strftime("%H:%M:%S"), item["key"], speaker, item.get("kind"),
                                  item.get("mood"), attempt + 1, seed, e, c, t, round(gen, 1),
                                  round(dur, 2), round(expected, 2), round(score, 3), heard, counted,
                                  verdict]})
            if ok:
                break
        best = max(takes, key=lambda k: (k["ok"], k["fits"], k["score"]))
        for k in takes:
            w.writerow(k["row"] + [k is best, item["text"], k["hyp"]])
        log.flush()
        with tempfile.TemporaryDirectory() as tmp:
            wav_path = os.path.join(tmp, "line.wav")
            sf.write(wav_path, best["audio"], SR)
            encode(wav_path, os.path.join(OUT_DIR, f"{item['key']}.mp3"))
        done_log.write(json.dumps({"key": item["key"], "fp": fp(item), "takes": len(takes),
                                   "ok": best["ok"], "score": round(best["score"], 3)}) + "\n")
        done_log.flush()
        rate = (time.time() - t_start) / n
        print(f"{n}/{len(todo)} {item['key']} takes={len(takes)} score={best['score']:.2f} "
              f"{'ok' if best['ok'] else 'KEPT-BEST'} avg={rate:.0f}s eta={rate * (len(todo) - n) / 3600:.1f}h",
              flush=True)
    print(f"shard {args.shard}: done, {len(todo)} clips in {(time.time() - t_start) / 3600:.2f} h")


if __name__ == "__main__":
    main()
