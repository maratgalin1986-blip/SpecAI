#!/usr/bin/env python3
"""Генерирует placeholder-иконки и сплэш для Expo (PNG, цвета сайта).

Запуск: python3 apps/mobile/scripts/generate-assets.py
Требуется Pillow (pip install pillow).
"""

from pathlib import Path

from PIL import Image, ImageDraw

AMBER = (217, 119, 6, 255)  # tailwind amber-600
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)

ASSETS = Path(__file__).resolve().parent.parent / 'assets'


def draw_mark(image: Image.Image, color: tuple[int, int, int, int]) -> None:
    """Простая эмблема: буква «S» в виде двух дуг и стрела экскаватора."""
    w, h = image.size
    d = ImageDraw.Draw(image)
    stroke = max(4, w // 12)
    pad = w // 4
    box = (pad, pad, w - pad, h - pad)
    # Верхняя дуга «S»
    d.arc((box[0], box[1], box[2], (box[1] + box[3]) // 2), start=0, end=270, fill=color, width=stroke)
    # Нижняя дуга «S»
    d.arc((box[0], (box[1] + box[3]) // 2, box[2], box[3]), start=180, end=90, fill=color, width=stroke)


def solid_icon(size: int, path: Path) -> None:
    img = Image.new('RGBA', (size, size), AMBER)
    d = ImageDraw.Draw(img)
    radius = size // 5
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    draw_mark(img, WHITE)
    out = Image.new('RGBA', (size, size), TRANSPARENT)
    out.paste(img, (0, 0), mask)
    out.save(path, 'PNG')
    del d


def transparent_mark(size: int, path: Path) -> None:
    img = Image.new('RGBA', (size, size), TRANSPARENT)
    draw_mark(img, WHITE)
    img.save(path, 'PNG')


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    solid_icon(1024, ASSETS / 'icon.png')
    transparent_mark(1024, ASSETS / 'adaptive-icon.png')
    transparent_mark(512, ASSETS / 'splash-icon.png')
    print('assets written to', ASSETS)


if __name__ == '__main__':
    main()
