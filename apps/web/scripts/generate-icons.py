#!/usr/bin/env python3
"""Generate PWA icons for СпецПласт16 (public/icons).

Requires Pillow (pip install pillow). Not a project dependency; run manually:
    pnpm --filter @specai/web icons
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BG = (217, 119, 6)  # amber-600, СпецПласт16 brand colour
FG = (255, 255, 255)
OUT = Path(__file__).resolve().parent.parent / 'public' / 'icons'

FONT_CANDIDATES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def draw_icon(size: int, *, maskable: bool, transparent_corners: bool) -> Image.Image:
    scale = 4  # supersample for smooth edges
    s = size * scale
    img = Image.new('RGBA', (s, s), BG if maskable else (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if maskable:
        # Maskable icons must fill the whole canvas; keep glyph in the safe zone (inner 80%).
        pad = int(s * 0.18)
    else:
        pad = 0
        radius = int(s * 0.22)
        if transparent_corners:
            draw.rounded_rectangle((0, 0, s - 1, s - 1), radius=radius, fill=BG)
        else:
            img.paste(BG, (0, 0, s, s))

    text = '16'
    font = load_font(int((s - 2 * pad) * 0.5))
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    w, h = right - left, bottom - top
    x = (s - w) / 2 - left
    y = (s - h) / 2 - top
    draw.text((x, y), text, font=font, fill=FG)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    targets = {
        'icon-192.png': (192, False, True),
        'icon-512.png': (512, False, True),
        'maskable-512.png': (512, True, False),
        # iOS ignores transparency and adds its own rounding, so keep a solid square.
        'apple-touch-icon.png': (180, False, False),
    }
    for name, (size, maskable, transparent) in targets.items():
        icon = draw_icon(size, maskable=maskable, transparent_corners=transparent)
        if not transparent:
            icon = icon.convert('RGB')
        icon.save(OUT / name, optimize=True)
        print(f'wrote {OUT / name} ({size}x{size})')


if __name__ == '__main__':
    main()
