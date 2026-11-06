#!/usr/bin/env python3
"""Сборка вертикального ролика 1080x1920 из кадров: размытый фон, медленный зум, кроссфейд, титры.
python3 automation/make_reel.py out.mp4 "img1.jpg|Титр 1" "img2.jpg|Титр 2" ...
"""
import subprocess, sys
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
SEC, FADE, FPS = 3.0, 0.6, 30
def esc(t): return t.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’").replace("%", "\\%")
def main(out, items):
    args, parts = [], []
    for k, it in enumerate(items):
        img, _, cap = it.partition("|")
        args += ["-loop", "1", "-t", str(SEC), "-i", img]
        n = int(SEC * FPS)
        parts.append(
            f"[{k}:v]split[a{k}][b{k}];"
            f"[a{k}]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:5,eq=brightness=-0.15[bg{k}];"
            f"[b{k}]scale=1080*1.6:-1,zoompan=z='1+0.0015*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s=1080x1404:fps={FPS}[fg{k}];"
            f"[bg{k}][fg{k}]overlay=0:(H-h)/2,"
            f"drawtext=fontfile={FONT}:text='{esc(cap)}':fontcolor=white:fontsize=64:borderw=4:bordercolor=black@0.6:x=(w-tw)/2:y=170,"
            f"drawtext=fontfile={FONT}:text='Амина — виртуальный AI-персонаж':fontcolor=white@0.85:fontsize=36:x=(w-tw)/2:y=h-150,"
            f"setsar=1,format=yuv420p,fps={FPS},trim=duration={SEC}[v{k}]")
    chain, last = [], "v0"
    for k in range(1, len(items)):
        off = k * (SEC - FADE)
        chain.append(f"[{last}][v{k}]xfade=transition=fade:duration={FADE}:offset={off:.2f}[x{k}]"); last = f"x{k}"
    fc = ";".join(parts + chain)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args, "-filter_complex", fc, "-map", f"[{last}]",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-movflags", "+faststart", out], check=True)
    print("ok", out)
if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
