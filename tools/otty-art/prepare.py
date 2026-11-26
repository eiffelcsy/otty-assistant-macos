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

# The cove: every time of day is repainted from cove-day, so all four share one horizon (measured: row 506 of 1024).
COVE_OUT = ROOT / 'src/renderer/src/assets/cove'
HORIZON, FEATHER = 506, 8
FLOAT_W = 768  # width of the floating Otty frames
PIECES = ('reeds', 'stones', 'lilypad', 'cloud', 'waterline', 'ripple', 'glints', 'dragonfly', 'leaf', 'birds')  # the cove's pieces
LIGHTS = ('cloud', 'waterline', 'ripple', 'glints')  # painted white on black: their brightness is their opacity
PIECE_MAX = 768  # longest side of a piece
JOIN_FROM = 0.45  # a sky is shifted onto its cove's top colour from here down (join)
HAZE, HAZE_BLUR = (192, 128), 6  # the haze's size and its blur radius, in its own pixels


def load(name: str) -> np.ndarray:
    return np.asarray(Image.open(SRC / name).convert('RGB')).astype(np.float32)


def eye_mask(shape: tuple[int, int]) -> np.ndarray:
    m = Image.new('L', (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(m)
    for cx, cy, rx, ry in EYES:
        d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
    return np.asarray(m.filter(ImageFilter.GaussianBlur(18))).astype(np.float32)[..., None] / 255


def background(rgb: np.ndarray, bottom: bool = False) -> np.ndarray:
    """Near-white pixels connected to the top/side borders (the bottom edge is a bust's body, unless `bottom`)."""
    bright = rgb.min(axis=2) > 243
    h, w = bright.shape
    seen = np.zeros_like(bright)
    stack = [(0, x) for x in range(w)] + [(y, 0) for y in range(h)] + [(y, w - 1) for y in range(h)]
    stack += [(h - 1, x) for x in range(w)] if bottom else []
    while stack:
        y, x = stack.pop()
        if 0 <= y < h and 0 <= x < w and bright[y, x] and not seen[y, x]:
            seen[y, x] = True
            stack += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
    return seen


def matte(rgb: np.ndarray, bg: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    # Soft matte: fully opaque away from the background; near it, opacity follows how far a pixel is from white.
    near = np.asarray(Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
    whiteness = (255 - rgb.min(axis=2)) / 45
    alpha = np.where(bg, 0, np.where(near, np.clip(whiteness, 0, 1), 1))
    # Un-mix the white the edge pixels were painted over.
    a = np.maximum(alpha, 1e-3)[..., None]
    return np.clip((rgb - 255 * (1 - a)) / a, 0, 255), alpha


def cutout(rgb: np.ndarray, bg: np.ndarray, fade_out: bool = True, size: int = SIZE) -> Image.Image:
    color, alpha = matte(rgb, bg)
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
    # Every other source but the cove is a bust expression in the same framing (generate.py), cut against its own background.
    for f in sorted(SRC.glob('*.webp')):
        if f.stem not in ('idle', 'idle-eyes-closed') and not f.stem.startswith(('cove-', 'sky-', 'float') + PIECES):
            frames[f.stem] = load(f.name)
    for name, rgb in frames.items():
        cutout(rgb, bg if name.startswith('idle') else background(rgb)).save(OUT / f'{name}.webp', quality=88, method=6)
        print('wrote', (OUT / f'{name}.webp').relative_to(ROOT))
    write_icns(app_icon(cutout(idle, bg, fade_out=False, size=OTTER)))
    for f in sorted(SRC.glob('cove-*.webp')):
        cove(f)
    for f in sorted(SRC.glob('sky-*.webp')):
        sky(f)
    floating()
    for f in sorted(SRC.glob('*.webp')):
        if f.stem.startswith(PIECES):
            piece(f)


def whole(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """A whole figure on white. The model paints a faint pale haze round it, which shows as a halo on dark water,
    so the edge is pulled in 2px."""
    color, alpha = matte(rgb, background(rgb, bottom=True))
    alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5))
                       .filter(ImageFilter.GaussianBlur(1))).astype(np.float32) / 255
    return color, alpha


def piece(f: Path) -> None:
    """A foreground piece of the cove (D-71 step 4), cut to its own box. Lights (clouds, the waterline, ripples,
    glints) are painted white on black, so their opacity is their brightness; everything else is a whole figure on white."""
    rgb = load(f.name)
    if f.stem.startswith(LIGHTS):
        alpha = rgb.max(axis=2) / 255
        color = np.clip(rgb / np.maximum(alpha, 1e-3)[..., None], 0, 255)
    else:
        color, alpha = whole(rgb)
    ys, xs = np.nonzero(alpha > 0.02)
    m = 8
    img = Image.fromarray(np.dstack([color, alpha * 255]).astype(np.uint8), 'RGBA')
    img = img.crop((max(xs.min() - m, 0), max(ys.min() - m, 0), xs.max() + m, ys.max() + m))
    img.thumbnail((PIECE_MAX, PIECE_MAX), Image.LANCZOS)
    img.save(COVE_OUT / f'{f.stem}.webp', quality=85, method=6)
    print('wrote', (COVE_OUT / f'{f.stem}.webp').relative_to(ROOT), img.size)


def floating() -> None:
    """The full-body Otty floating on its back (D-71 step 3). Variants are repainted from float.webp but drift a few
    pixels, so each is moved to where its body best overlaps the base before all are cut with the base's box."""
    base = load('float.webp')
    base_a = matte(base, background(base, bottom=True))[1]
    ys, xs = np.nonzero(base_a > 0.5)
    m = 40  # room for a variant's paw or tail that reaches past the base
    box = (xs.min() - m, ys.min() - m, xs.max() + m, ys.max() + m)
    for f in sorted(SRC.glob('float*.webp')):
        rgb = load(f.name)
        color, alpha = whole(rgb)
        dy, dx = (0, 0) if f.stem == 'float' else best_shift(base_a, alpha)
        img = Image.fromarray(np.dstack([color, alpha * 255]).astype(np.uint8), 'RGBA')
        moved = Image.new('RGBA', img.size)
        moved.paste(img, (dx, dy))
        out = moved.crop(box)
        out = out.resize((FLOAT_W, round(out.height * FLOAT_W / out.width)), Image.LANCZOS)
        out.save(OUT / f'{f.stem}.webp', quality=88, method=6)
        print('wrote', (OUT / f'{f.stem}.webp').relative_to(ROOT), f'(moved {dx}, {dy})')


def best_shift(a: np.ndarray, b: np.ndarray) -> tuple[int, int]:
    """The (dy, dx) that moves mask b onto mask a, by cross-correlation."""
    c = np.fft.irfft2(np.fft.rfft2(a) * np.conj(np.fft.rfft2(b)), a.shape)
    dy, dx = np.unravel_index(c.argmax(), c.shape)
    h, w = a.shape
    return (int(dy - h) if dy > h // 2 else int(dy)), (int(dx - w) if dx > w // 2 else int(dx))


def cove(f: Path) -> None:
    """Splits a cove picture at its horizon into the two parallax layers (BRAINSTORM, "The living cove").
    The shore is the sky and hills down to just past the horizon; the water is everything below, with a soft top edge,
    so it can slide up over the shore while scrolling without a seam."""
    img = Image.open(f).convert('RGB')
    w, h = img.size
    assert (w, h) == (1536, 1024), f'{f.name} is {w}x{h}; the cove recipes paint 1536x1024'
    COVE_OUT.mkdir(parents=True, exist_ok=True)
    img.crop((0, 0, w, HORIZON + FEATHER)).save(COVE_OUT / f'{f.stem}-shore.webp', quality=80, method=6)
    water = img.crop((0, HORIZON - FEATHER, w, h)).convert('RGBA')
    ramp = np.clip(np.arange(h - HORIZON + FEATHER) / (2 * FEATHER), 0, 1)
    water.putalpha(Image.fromarray((np.repeat(ramp[:, None], w, axis=1) * 255).astype(np.uint8)))
    water.save(COVE_OUT / f'{f.stem}-water.webp', quality=80, method=6)
    print('wrote', (COVE_OUT / f'{f.stem}-shore.webp').relative_to(ROOT), 'and -water')
    haze(img).save(COVE_OUT / f"haze-{f.stem.removeprefix('cove-')}.webp", quality=82, method=6)
    print(patches(img))
    print(haze_patches(img))


def sky(f: Path) -> None:
    """The sky above a cove, where the camera tilts to (Spec 08, Part 9), as painted; and what its sheet's test holds."""
    img = Image.open(f).convert('RGB')
    assert img.size == (1536, 1024), f'{f.name} is {img.size}; the sky recipes paint 1536x1024'
    img = join(img, Image.open(SRC / f"cove-{f.stem.removeprefix('sky-')}.webp").convert('RGB'))
    img.save(COVE_OUT / f'{f.stem}.webp', quality=80, method=6)
    print('wrote', (COVE_OUT / f'{f.stem}.webp').relative_to(ROOT))
    print(sky_patches(img, f.stem.removeprefix('sky-')))


def join(sky: Image.Image, cove: Image.Image) -> Image.Image:
    """The model paints a glow along a sky's foot however it's asked, so the seam is made here: the lower part of the
    sky is shifted, by a smooth ramp, onto the colour of the cove's top edge, keeping its brushwork."""
    rgb = np.asarray(sky, dtype=float)
    h = rgb.shape[0]
    delta = np.asarray(cove, dtype=float)[:24].mean(axis=(0, 1)) - rgb[-24:].mean(axis=(0, 1))
    t = np.clip((np.arange(h) / h - JOIN_FROM) / (1 - JOIN_FROM), 0, 1)
    ramp = (t * t * (3 - 2 * t))[:, None, None]
    return Image.fromarray(np.clip(rgb + delta * ramp, 0, 255).astype(np.uint8))


def sky_patches(img: Image.Image, time: str) -> str:
    """The sky's darkest and lightest 32 px patch: what the reading sheet over it must read on (rules/renderer.test.ts)."""
    return f'{time}: {extremes(np.asarray(img.convert("RGB"), dtype=float), 32)},'


def haze(img: Image.Image) -> Image.Image:
    """The painting as a blur of its colours, the backdrop the sidebar's frosted glass shows (Spec 08, Part 8). Blurred
    here, small, so the window never runs a blur: scaled up, a blurred picture stays smooth."""
    return img.convert('RGB').resize(HAZE, Image.LANCZOS).filter(ImageFilter.GaussianBlur(HAZE_BLUR))


def haze_patches(img: Image.Image) -> str:
    """The haze's darkest and lightest pixel, away from its edges: what the side glass's test holds (Spec 08, Part 8)."""
    rgb = np.asarray(haze(img), dtype=float)[8:-8, 8:-8].reshape(-1, 3)
    lum = luminance(rgb)
    time = Path(img.filename).stem.removeprefix('cove-') if getattr(img, 'filename', '') else '?'
    return f'{time}: {[np.rint(rgb[i]).astype(int).tolist() for i in (lum.argmin(), lum.argmax())]},'


def luminance(rgb: np.ndarray) -> np.ndarray:
    c = rgb / 255
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return c @ [0.2126, 0.7152, 0.0722]


def extremes(rgb: np.ndarray, block: int) -> list[list[int]]:
    """The darkest and lightest block-sized patch (by WCAG luminance) of a region, as their mean colours."""
    h, w = (s - s % block for s in rgb.shape[:2])
    means = rgb[:h, :w].reshape(h // block, block, w // block, block, 3).mean(axis=(1, 3)).reshape(-1, 3)
    lum = luminance(means)
    return [np.rint(means[i]).astype(int).tolist() for i in (lum.argmin(), lum.argmax())]


def patches(img: Image.Image) -> str:
    """What the cove's contrast test (rules/renderer.test.ts, Spec 07 Part 5) holds for this painting: the darkest and
    lightest 32 px patch anywhere (glass), and 16 px patches of the bands behind the greeting (rows 180–420, the middle
    half) and the header's icons (rows 40–200, the right 35%), plus the water's bottom colour (--cv-deep).
    Copy the line into COVE in the test when a painting changes."""
    rgb = np.asarray(img.convert('RGB'), dtype=float)
    w = rgb.shape[1]
    deep = '#' + ''.join(f'{v:02x}' for v in np.rint(rgb[-24:].mean(axis=(0, 1))).astype(int))
    time = Path(img.filename).stem.removeprefix('cove-') if getattr(img, 'filename', '') else '?'
    return (f"{time}: {{ glass: {extremes(rgb, 32)}, sky: {extremes(rgb[180:420, w // 4 : w * 3 // 4], 16)}, "
            f"top: {extremes(rgb[40:200, w * 13 // 20 :], 16)}, deep: '{deep}' }},")


if __name__ == '__main__':
    import sys

    if sys.argv[1:] == ['--patches']:  # measure only, writing nothing
        for f in sorted(SRC.glob('cove-*.webp')):
            print(patches(Image.open(f)))
            print(haze_patches(Image.open(f)))
        for f in sorted(SRC.glob('sky-*.webp')):
            print(sky_patches(Image.open(f), f.stem.removeprefix('sky-')))
    elif sys.argv[1:] == ['--cove']:  # the cove's layers, haze and skies only
        for f in sorted(SRC.glob('cove-*.webp')):
            cove(f)
        for f in sorted(SRC.glob('sky-*.webp')):
            sky(f)
    else:
        main()
