"""Create a reproducible source-and-database archive for case submission."""

from hashlib import sha256
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import json


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'output'
OUTPUT.mkdir(exist_ok=True)
ARCHIVE = OUTPUT / 'CALIBER2026-source-and-database.zip'
INCLUDE = (
    'README.md', 'SUBMISSION.md', 'PRODUCT.md', 'DESIGN.md',
    'CALIBER 2026 - Final Case Brief.pdf',
    'package.json', 'package-lock.json', 'vite.config.js', 'playwright.config.js',
    'vercel.json', '.vercelignore', 'requirements-train.txt',
    'pipeline', 'core', 'api', 'web', 'data', 'dataset', 'tests', 'docs', 'scripts',
)


def files():
    for name in INCLUDE:
        path = ROOT / name
        if path.is_file():
            yield path
        elif path.is_dir():
            for item in sorted(path.rglob('*')):
                if item.is_file() and '__pycache__' not in item.parts and not item.name.endswith('.pyc'):
                    yield item


with ZipFile(ARCHIVE, 'w', compression=ZIP_DEFLATED, compresslevel=6) as bundle:
    for path in files():
        bundle.write(path, path.relative_to(ROOT))

digest = sha256(ARCHIVE.read_bytes()).hexdigest()
manifest = {
    'archive': ARCHIVE.name,
    'bytes': ARCHIVE.stat().st_size,
    'sha256': digest,
    'entries': len(ZipFile(ARCHIVE).namelist()),
}
(OUTPUT / 'archive-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest, indent=2))
