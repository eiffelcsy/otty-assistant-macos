"""Paints new source art for Otty (tools/otty-art/source/) with OpenAI's image model, in the hand of the idle portrait (D-71).

Every request sends source/idle.webp as the style reference. Bust recipes keep its framing (1254px square,
white background, head centred), so prepare.py's crop, cut-out and blink work unchanged.
The key comes only from the Keychain:  security add-generic-password -s otty-art-openai -a "$USER" -w

Run:  .venv/bin/python tools/otty-art/generate.py thinking oops   (names from RECIPES; --force replaces a kept source,
--list shows them). Each try is also kept in tools/otty-art/tries/ (ignored by git) to compare before keeping.
"""
import base64
import io
import json
import subprocess
import sys
import urllib.request
import uuid
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'tools/otty-art/source'
TRIES = ROOT / 'tools/otty-art/tries'
MODEL = 'gpt-image-2'
SOURCE_SIZE = 1254  # the idle portrait's size, which prepare.py's CROP and EYES assume

STYLE = (
    'This is Otty, a baby otter mascot. Paint the SAME character in the SAME style as the reference: soft, dry-brush '
    'children\'s-book painting, visible fur strokes, warm brown fur with a cream face and chest, big glossy dark eyes '
    'with one white highlight, a dark brown nose, rosy cheeks, thin whiskers, rounded ears. Keep the same palette, '
    'proportions and line weight. No outlines, no text, no extra objects unless asked. '
)
BUST = (
    'Keep the exact framing of the reference: square, plain pure white background, head and shoulders, head centred '
    'at the same size and height, shoulders running off the bottom edge, nothing touching the top or sides. '
)

# name: (prompt, size). Bust expressions keep the reference's face; only what the expression needs changes.
RECIPES: dict[str, tuple[str, str]] = {
    'thinking': (BUST + 'Expression: thinking. Eyes looking up and to one side, mouth a small closed line, one small '
                 'paw raised to touch its chin.', '1024x1024'),
    'oops': (BUST + 'Expression: a gentle, sheepish "oops". Eyebrows raised and tilted, a small wobbly smile, one small '
             'paw resting on its cheek, kept well inside the picture, away from the edges. Apologetic but sweet, '
             'never sad or scared.', '1024x1024'),
    'listening': (BUST + 'Expression: listening closely to a sound. No paws visible. Head turned a little to one side, '
                  'both ears perked up, eyes wide and glancing towards the sound, mouth a small closed smile.', '1024x1024'),
    'wink': (BUST + 'Expression: a playful wink. Its right eye closed in a happy curve, left eye open as in the '
             'reference, a bigger smile.', '1024x1024'),
    'cheer': (BUST + 'Expression: delighted. Both eyes closed in happy upward curves, mouth open in a big smile, both '
              'small paws raised beside its face in a little cheer.', '1024x1024'),
    'tilt': (BUST + 'Expression: curious. Head tilted about 15 degrees to one side, eyes open and wondering, mouth a '
             'small "o".', '1024x1024'),
    'sleepy': (BUST + 'Expression: dozing off, peaceful and content. Both eyes gently closed as soft downward curves, '
               'a tiny relaxed smile, head drooping slightly. Calm, never grumpy.', '1024x1024'),
    'mouth-open': (BUST + 'Expression: eager to eat. Eyes bright, mouth wide open as if about to take a bite, tongue '
                   'just visible.', '1024x1024'),
    'munch': (BUST + 'Expression: munching happily. Eyes closed in happy curves, cheeks puffed full, mouth closed and '
              'chewing.', '1024x1024'),
    'catch': (BUST + 'Pose: ready to catch. Both small paws raised in front of its chest, palms up and open, eyes '
              'wide and excited, smiling.', '1024x1024'),
}


def key() -> str:
    run = subprocess.run(['security', 'find-generic-password', '-s', 'otty-art-openai', '-w'],
                         capture_output=True, text=True)
    if run.returncode:
        sys.exit('No key in the Keychain: security add-generic-password -s otty-art-openai -a "$USER" -w')
    return run.stdout.strip()


def multipart(fields: dict[str, str], files: dict[str, tuple[str, bytes, str]]) -> tuple[bytes, str]:
    b = uuid.uuid4().hex
    out = io.BytesIO()
    for k, v in fields.items():
        out.write(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for k, (fname, data, ctype) in files.items():
        out.write(f'--{b}\r\nContent-Disposition: form-data; name="{k}"; filename="{fname}"\r\n'
                  f'Content-Type: {ctype}\r\n\r\n'.encode() + data + b'\r\n')
    out.write(f'--{b}--\r\n'.encode())
    return out.getvalue(), f'multipart/form-data; boundary={b}'


def paint(prompt: str, size: str) -> Image.Image:
    ref = io.BytesIO()
    Image.open(SRC / 'idle.webp').convert('RGB').save(ref, 'PNG')
    body, ctype = multipart({'model': MODEL, 'prompt': STYLE + prompt, 'size': size, 'quality': 'high', 'n': '1'},
                            {'image[]': ('idle.png', ref.getvalue(), 'image/png')})
    req = urllib.request.Request('https://api.openai.com/v1/images/edits', body,
                                 {'Authorization': f'Bearer {key()}', 'Content-Type': ctype})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f'OpenAI said {e.code}: {e.read().decode()[:500]}')
    return Image.open(io.BytesIO(base64.b64decode(data['data'][0]['b64_json']))).convert('RGB')


def main(args: list[str]) -> None:
    force = '--force' in args
    names = [a for a in args if not a.startswith('--')]
    if '--list' in args or not names:
        print('\n'.join(RECIPES))
        return
    TRIES.mkdir(exist_ok=True)
    for name in names:
        if name not in RECIPES:
            sys.exit(f'No recipe called {name}')
        out = SRC / f'{name}.webp'
        if out.exists() and not force:
            print(f'{out.name} is kept already; --force to replace it')
            continue
        prompt, size = RECIPES[name]
        img = paint(prompt, size)
        if size == '1024x1024':
            img = img.resize((SOURCE_SIZE, SOURCE_SIZE), Image.LANCZOS)
        n = len(list(TRIES.glob(f'{name}-*.webp'))) + 1
        img.save(TRIES / f'{name}-{n}.webp', quality=95)
        print('painted', (TRIES / f'{name}-{n}.webp').relative_to(ROOT))


if __name__ == '__main__':
    main(sys.argv[1:])
