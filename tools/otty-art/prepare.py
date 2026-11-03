"""Turns Otty's generated art (tools/otty-art/source/) into the frames the app ships (src/renderer/src/assets/otty/).

Sources are square head-and-shoulders portraits on a plain white background, all framed the same way.
For each one this cuts out the background with a soft edge, fades the bottom out, crops to a square and saves a 512px WebP.
A blink frame is the idle frame with only the eye area taken from the eyes-closed art, so nothing else shimmers mid-blink.

Run (needs Pillow + numpy):  python3 -m venv .venv && .venv/bin/pip install pillow numpy && .venv/bin/python tools/otty-art/prepare.py
"""
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


def cutout(rgb: np.ndarray, bg: np.ndarray) -> Image.Image:
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
    alpha = alpha * fade
    img = Image.fromarray(np.dstack([color, alpha * 255]).astype(np.uint8), 'RGBA')
    return img.crop(CROP).resize((SIZE, SIZE), Image.LANCZOS)


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


if __name__ == '__main__':
    main()
