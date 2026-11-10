#!/usr/bin/env python3
"""Бесплатная генерация через AI Horde (img2img от эталона). Анонимный ключ, очередь ~5 мин.
python3 automation/horde_gen.py automation/jobs.json   -> assets/images/<cat>/<id>.jpg + строки catalog.csv
"""
import json, sys, time, base64, urllib.request, io, threading, csv, os
from PIL import Image
H = {"apikey": os.environ.get("HORDE_KEY", "0000000000"), "Content-Type": "application/json",
     "Client-Agent": "amina-safina:1:anon", "User-Agent": "amina-safina/1.0"}
BASE = ("photorealistic luxury glamour editorial photo of a 26-year-old Tatar woman, long dark brown hair, "
        "warm brown eyes, natural attractive features, realistic skin texture, natural light, magazine quality, ")
NEG = " ### nude, nsfw, nipples, lingerie, see-through, deformed hands, extra fingers, text, watermark, child, teen"
def req(url, data=None):
    r = urllib.request.Request(url, json.dumps(data).encode() if data else None, H)
    return json.load(urllib.request.urlopen(r, timeout=90))
lock = threading.Lock()
def run(job):
    out = f"assets/images/{job['cat']}/{job['id']}.jpg"
    if os.path.exists(out): print("skip", job["id"]); return
    body = {"prompt": BASE + job["prompt"] + NEG, "models": ["Juggernaut XL"], "nsfw": False, "censor_nsfw": True,
            "r2": True,
            "params": {"width": job.get("w", 640), "height": job.get("h", 832), "steps": 25, "cfg_scale": 6,
                       "sampler_name": "k_euler_a", "n": 1}}
    if "seed" in job: body["params"]["seed"] = str(job["seed"])
    if job.get("src", "ref") != "none":   # img2img от эталона; "src": "none" -> txt2img (свободная композиция)
        sp = job.get("src", "ref"); sp = sp if "/" in sp else f"assets/reference/src/{sp}.png"
        buf = io.BytesIO(); Image.open(sp).convert("RGB").resize((body["params"]["width"], body["params"]["height"])).save(buf, "PNG")
        body.update(source_image=base64.b64encode(buf.getvalue()).decode(), source_processing="img2img")
        body["params"]["denoising_strength"] = job.get("den", 0.6)
    for attempt in range(2):
        try:
            i = req("https://aihorde.net/api/v2/generate/async", body)["id"]
            for _ in range(120):
                time.sleep(15)
                if req(f"https://aihorde.net/api/v2/generate/check/{i}").get("done"): break
            g = req(f"https://aihorde.net/api/v2/generate/status/{i}")["generations"][0]
            if g.get("censored"): print("censored", job["id"]); continue
            data = urllib.request.urlopen(urllib.request.Request(g["img"], headers={"User-Agent": H["User-Agent"]}), timeout=90).read()
            Image.open(io.BytesIO(data)).convert("RGB").save(out, quality=92)
            with lock, open("assets/catalog.csv", "a", newline="") as f:
                csv.writer(f).writerow([job["id"], job["cat"], out, "", job["prompt"][:60], "готов (AI Horde)", "проверить", "проверить", job.get("fit", "пост 4:5"), time.strftime("%Y-%m-%d")])
            print("ok", job["id"], flush=True); return
        except Exception as e:
            print("err", job["id"], e, flush=True); time.sleep(20)
if __name__ == "__main__":
    jobs = json.load(open(sys.argv[1]))
    ts = [threading.Thread(target=run, args=(j,)) for j in jobs]
    for t in ts: t.start(); time.sleep(3)
    for t in ts: t.join()
