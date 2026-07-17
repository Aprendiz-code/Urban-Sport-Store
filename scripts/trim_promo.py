from PIL import Image, ImageChops
import sys
from pathlib import Path

p = Path('src/assets/cinta-10.png')
if not p.exists():
    print('File not found:', p)
    sys.exit(1)

img = Image.open(p).convert('RGBA')
# Try crop by alpha channel first
if 'A' in img.getbands():
    alpha = img.split()[-1]
    bbox = alpha.getbbox()
else:
    bbox = None

if not bbox:
    # Fallback: crop by difference from white background
    bg = Image.new('RGBA', img.size, (255,255,255,255))
    diff = ImageChops.difference(img, bg)
    bbox = diff.getbbox()

if not bbox:
    print('No crop needed; image appears full.')
else:
    cropped = img.crop(bbox)
    cropped.save(p)
    print('Cropped and saved:', p)
