"""Add an explicit evidence header to screenshots captured from the live site."""

from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
import json

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'qa'
capture = json.loads((OUT / 'live-capture.json').read_text())
captured = datetime.fromisoformat(capture['captured_at_utc'].replace('Z', '+00:00')).astimezone(ZoneInfo('Asia/Jakarta'))
stamp = captured.strftime('%Y-%m-%d %H:%M:%S WIB')

font_path = '/System/Library/Fonts/Supplemental/Arial.ttf'
try:
    font = ImageFont.truetype(font_path, 23)
    small = ImageFont.truetype(font_path, 17)
except OSError:
    font = ImageFont.load_default()
    small = font

for name in ('overview', 'scenario'):
    source = Image.open(OUT / f'live-{name}-raw.png').convert('RGB')
    header = 92
    canvas = Image.new('RGB', (source.width, source.height + header), '#172a36')
    canvas.paste(source, (0, header))
    draw = ImageDraw.Draw(canvas)
    draw.text((24, 15), f'LIVE VERCEL CAPTURE · {name.upper()}', font=font, fill='#ffffff')
    draw.text((24, 52), f"{capture['url']}/#/{name}   ·   {stamp}", font=small, fill='#c8d8da')
    canvas.save(OUT / f'live-{name}-timestamped.png')

print(stamp)
