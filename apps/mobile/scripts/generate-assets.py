#!/usr/bin/env python3
"""Генерирует иконку, adaptive-icon и сплэш для Expo в стиле сайта СпецПласт16.

Логотип сайта (apps/web/src/app/icon.svg) — оранжевый скруглённый квадрат (amber-600)
с белым текстом; здесь на плашке буквы «СП16».

Запуск: python3 apps/mobile/scripts/generate-assets.py
Требуется Pillow (pip install pillow) и любой TTF-шрифт с кириллицей (DejaVu/FreeSans/Liberation).
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

AMBER = (217, 119, 6, 255)  # tailwind amber-600, как в icon.svg и шапке сайта
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)
LABEL = 'СП16'

ASSETS = Path(__file__).resolve().parent.parent / 'assets'

FONT_CANDIDATES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
    '/Library/Fonts/Arial Bold.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    raise SystemExit('Не найден TTF-шрифт с кириллицей — добавьте путь в FONT_CANDIDATES')


def draw_label(image: Image.Image, color: tuple[int, int, int, int], scale: float = 0.62) -> None:
    """Текст «СП16», вписанный по ширине в `scale` от стороны изображения."""
    w, h = image.size
    d = ImageDraw.Draw(image)
    size = int(w * 0.4)
    font = load_font(size)
    target = w * scale
    left, top, right, bottom = d.textbbox((0, 0), LABEL, font=font)
    ratio = target / max(1, right - left)
    font = load_font(max(8, int(size * ratio)))
    left, top, right, bottom = d.textbbox((0, 0), LABEL, font=font)
    x = (w - (right - left)) / 2 - left
    y = (h - (bottom - top)) / 2 - top
    d.text((x, y), LABEL, font=font, fill=color)


def solid_icon(size: int, path: Path) -> None:
    """Иконка приложения: оранжевая плашка со скруглением, как icon.svg сайта."""
    img = Image.new('RGBA', (size, size), AMBER)
    radius = int(size * 14 / 64)  # rx=14 при viewBox 64 в icon.svg
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    draw_label(img, WHITE)
    out = Image.new('RGBA', (size, size), TRANSPARENT)
    out.paste(img, (0, 0), mask)
    out.save(path, 'PNG')


def transparent_label(size: int, path: Path, scale: float) -> None:
    """Белые буквы на прозрачном фоне — для adaptive-icon (фон задаёт app.json) и сплэша."""
    img = Image.new('RGBA', (size, size), TRANSPARENT)
    draw_label(img, WHITE, scale)
    img.save(path, 'PNG')


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    solid_icon(1024, ASSETS / 'icon.png')
    # Android обрезает adaptive-icon до безопасной зоны (~66 %), поэтому текст компактнее.
    transparent_label(1024, ASSETS / 'adaptive-icon.png', scale=0.5)
    transparent_label(512, ASSETS / 'splash-icon.png', scale=0.8)
    print('assets written to', ASSETS)


if __name__ == '__main__':
    main()
