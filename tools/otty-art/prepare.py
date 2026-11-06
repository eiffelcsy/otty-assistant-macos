"""Turns Otty's generated art (tools/otty-art/source/) into the frames the app ships (src/renderer/src/assets/otty/),
and the app icon (build/icon.icns, which electron-builder picks up by itself).

Sources are square head-and-shoulders portraits on a plain white background, all framed the same way.
For each one this cuts out the background with a soft edge, fades the bottom out, crops to a square and saves a 512px WebP.
A blink frame is the idle frame with only the eye area taken from the eyes-closed art, so nothing else shimmers mid-blink.

Run (needs Pillow + numpy):  python3 -m venv .venv && .venv/bin/pip install pillow numpy && .venv/bin/python tools/otty-art/prepare.py
"""
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'tools/otty-art/source'
OUT = ROOT / 'src/renderer/src/assets/otty'
SIZE = 512

# Shared framing of the source art (1254px square): crop box, and the eye area for blink frames.
CROP = (40, 80, 1214, 1254)  # left, top, right, bottom: square, head centred, shoulders run off the bottom
EYES = [(385, 575, 120, 140), (885, 575, 120, 140)]  # cx, cy, rx, ry of each eye (with its brow)
FADE = 0.12  # fraction of the height faded out at the bottom, so the bust doesn't end in a hard line

# The app icon, on Apple's 1024px grid: an 824px rounded tile, leaving room around it for the shadow.
ICON = ROOT / 'build/icon.icns'
CANVAS, TILE, RADIUS = 1024, 824, 186
TILE_TOP, TILE_BOTTOM = (163, 184, 124), (99, 124, 66)  # lighter meadow to --meadow
OTTER = 790  # width of Otty on the tile; the shoulders run off its bottom edge


def load(name: str) -> np.ndarray:
    return np.asarray(Image.open(SRC / name).convert('RGB')).astype(np.float32)


def eye_mask(shape: tuple[int, int]) -> np.ndarray:
    m = Image.new('L', (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(m)
    for cx, cy, rx, ry in EYES:
        d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
    return np.asarray(m.filter(ImageFilter.GaussianBlur(18))).astype(np.float32)[..., None] / 255


def background(rgb: np.ndarray) -> np.ndarray:
    """Near-white pixels connected to the top/side borders (the bottom edge is Otty's body)."""
    bright = rgb.min(axis=2) > 243
    h, w = bright.shape
    seen = np.zeros_like(bright)
    stack = [(0, x) for x in range(w)] + [(y, 0) for y in range(h)] + [(y, w - 1) for y in range(h)]
    while stack:
        y, x = stack.pop()
        if 0 <= y < h and 0 <= x < w and bright[y, x] and not seen[y, x]:
            seen[y, x] = True
            stack += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
    return seen


def cutout(rgb: np.ndarray, bg: np.ndarray, fade_out: bool = True, size: int = SIZE) -> Image.Image:
    # Soft matte: fully opaque away from the background; near it, opacity follows how far a pixel is from white.
    near = np.asarray(Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
    whiteness = (255 - rgb.min(axis=2)) / 45
    alpha = np.where(bg, 0, np.where(near, np.clip(whiteness, 0, 1), 1))
    # Un-mix the white the edge pixels were painted over.
    a = np.maximum(alpha, 1e-3)[..., None]
    color = np.clip((rgb - 255 * (1 - a)) / a, 0, 255)
    h = rgb.shape[0]
    top = CROP[3] - (CROP[3] - CROP[1]) * FADE
    fade = np.clip((CROP[3] - np.arange(h)) / (CROP[3] - top), 0, 1)[:, None]
    if fade_out:
        alpha = alpha * fade
    img = Image.fromarray(np.dstack([color, alpha * 255]).astype(np.uint8), 'RGBA')
    return img.crop(CROP).resize((size, size), Image.LANCZOS)


def app_icon(otter: Image.Image) -> Image.Image:
    """Otty on a rounded meadow tile, with the soft shadow macOS icons have."""
    ramp = np.linspace(0, 1, TILE)[:, None, None]
    tile = (np.array(TILE_TOP) * (1 - ramp) + np.array(TILE_BOTTOM) * ramp) * np.ones((TILE, TILE, 1))
    art = Image.fromarray(tile.astype(np.uint8), 'RGB').convert('RGBA')
    art.alpha_composite(otter, ((TILE - otter.width) // 2, TILE - otter.height))

    # Drawn large and shrunk, for a smooth edge.
    mask = Image.new('L', (TILE * 4, TILE * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, TILE * 4 - 1, TILE * 4 - 1), RADIUS * 4, fill=255)
    mask = mask.resize((TILE, TILE), Image.LANCZOS)

    at = (CANVAS - TILE) // 2
    shadow = Image.new('L', (CANVAS, CANVAS), 0)
    shadow.paste(mask, (at, at + 12))
    icon = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    icon.putalpha(shadow.filter(ImageFilter.GaussianBlur(14)).point(lambda v: int(v * 0.3)))
    icon.paste(art, (at, at), mask)
    return icon


def write_icns(icon: Image.Image) -> None:
    """`iconutil` comes with macOS. Elsewhere the committed icon stays as it is."""
    if not shutil.which('iconutil'):
        print('no iconutil here, so', ICON.relative_to(ROOT), 'was left alone')
        return
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp) / 'icon.iconset'
        folder.mkdir()
        for size in (16, 32, 128, 256, 512):
            icon.resize((size, size), Image.LANCZOS).save(folder / f'icon_{size}x{size}.png')
            icon.resize((size * 2, size * 2), Image.LANCZOS).save(folder / f'icon_{size}x{size}@2x.png')
        subprocess.run(['iconutil', '-c', 'icns', str(folder), '-o', str(ICON)], check=True)
    print('wrote', ICON.relative_to(ROOT))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    idle = load('idle.webp')
    bg = background(idle)
    frames = {'idle': idle}
    closed = SRC / 'idle-eyes-closed.webp'
    if closed.exists():
        m = eye_mask(idle.shape[:2])
        frames['idle-blink'] = idle * (1 - m) + load(closed.name) * m
    for name, rgb in frames.items():
        cutout(rgb, bg).save(OUT / f'{name}.webp', quality=88, method=6)
        print('wrote', (OUT / f'{name}.webp').relative_to(ROOT))
    write_icns(app_icon(cutout(idle, bg, fade_out=False, size=OTTER)))


if __name__ == '__main__':
    main()
