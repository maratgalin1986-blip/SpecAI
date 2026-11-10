#!/usr/bin/env python3
"""Доводка лица на кадрах в полный рост (аналог ADetailer) через AI Horde.
Находит лицо (OpenCV), вырезает квадрат вокруг головы, перерисовывает его img2img тем же
«портретным» промптом, что и вся серия, и вклеивает обратно с мягкой маской.
python3 automation/face_fix.py in.jpg [out.jpg] [--den 0.5]
Требует: pip install "opencv-python-headless<5" (только для этого шага).
"""
import base64, io, json, os, sys, time, urllib.request
from PIL import Image, ImageDraw, ImageFilter

H = {"apikey": os.environ.get("HORDE_KEY", "0000000000"), "Content-Type": "application/json",
     "Client-Agent": "amina-safina:1:anon", "User-Agent": "amina-safina/1.0"}
FACE = ("close-up beauty portrait photo of a 26-year-old Tatar woman, long dark brown hair, warm brown eyes, "
        "thick dark eyebrows, full lips, natural attractive features, realistic skin texture, soft natural light, "
        "sharp focus, magazine quality ### deformed, blurry, old, wrinkles, text, watermark, child, teen")


def _req(url, data=None):
    r = urllib.request.Request(url, json.dumps(data).encode() if data else None, H)
    return json.load(urllib.request.urlopen(r, timeout=90))


YUNET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "face_detection_yunet_2023mar.onnx")


def find_face(img):
    """(x, y, w, h) самого уверенного лица или None. YuNet (точный), запасной вариант — каскад Хаара."""
    import cv2, numpy as np
    bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    if os.path.exists(YUNET) and hasattr(cv2, "FaceDetectorYN"):
        det = cv2.FaceDetectorYN.create(YUNET, "", (img.width, img.height), 0.6, 0.3, 50)
        _, faces = det.detect(bgr)
        if faces is not None and len(faces):
            f = max(faces, key=lambda r: r[14] * (r[2] * r[3]) ** 0.5)   # уверенность × размер
            x, y, w, h = [int(v) for v in f[:4]]
            return max(x, 0), max(y, 0), w, h
        return None
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    c = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    found = [f for f in c.detectMultiScale(g, scaleFactor=1.08, minNeighbors=8, minSize=(24, 24)) if f[1] + f[3] / 2 < img.height * 0.5]
    return tuple(int(v) for v in max(found, key=lambda f: f[2] * f[3])) if found else None


def head_box(img, face, k=2.3):
    x, y, w, h = face
    side = int(min(max(w, h) * k, img.width, img.height))
    cx, cy = x + w // 2, y + h // 2
    l = min(max(cx - side // 2, 0), img.width - side)
    t = min(max(cy - side // 2, 0), img.height - side)
    return l, t, side


def redraw(crop, den):
    buf = io.BytesIO(); crop.resize((640, 640), Image.LANCZOS).save(buf, "PNG")
    body = {"prompt": FACE, "models": ["Juggernaut XL"], "nsfw": False, "censor_nsfw": True, "r2": True,
            "source_image": base64.b64encode(buf.getvalue()).decode(), "source_processing": "img2img",
            "params": {"width": 640, "height": 640, "steps": 25, "cfg_scale": 6, "sampler_name": "k_euler_a",
                       "denoising_strength": den, "n": 1}}
    i = _req("https://aihorde.net/api/v2/generate/async", body)["id"]
    for _ in range(120):
        time.sleep(12)
        if _req(f"https://aihorde.net/api/v2/generate/check/{i}").get("done"):
            break
    g = _req(f"https://aihorde.net/api/v2/generate/status/{i}")["generations"][0]
    if g.get("censored"):
        raise RuntimeError("censored")
    data = urllib.request.urlopen(urllib.request.Request(g["img"], headers={"User-Agent": H["User-Agent"]}), timeout=90).read()
    return Image.open(io.BytesIO(data)).convert("RGB")


def fix(path, out=None, den=0.5):
    img = Image.open(path).convert("RGB")
    face = find_face(img)
    if not face:
        return "noface"
    if face[2] > img.width * 0.42:      # крупный портрет — лицо уже детальное
        return "skip-large"
    l, t, side = head_box(img, face)
    new = redraw(img.crop((l, t, l + side, t + side)), den).resize((side, side), Image.LANCZOS)
    mask = Image.new("L", (side, side), 0)
    m = int(side * 0.14)
    ImageDraw.Draw(mask).ellipse((m, m, side - m, side - m), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(side * 0.07))
    img.paste(new, (l, t), mask)
    img.save(out or path, quality=93)
    return "fixed"


if __name__ == "__main__":
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    den = float(sys.argv[sys.argv.index("--den") + 1]) if "--den" in sys.argv else 0.5
    print(fix(a[0], a[1] if len(a) > 1 else None, den), a[0])
