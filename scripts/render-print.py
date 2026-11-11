"""Render representative PDF previews with the existing print dependencies."""
import sys
from pathlib import Path

import pdfplumber

output = Path(sys.argv[1])
for source, target, monochrome in [
    ('charts-letter', 'chart-preview', False),
    ('coordinates-a4', 'coordinates-preview', False),
    ('dense-a4', 'monochrome-preview', True),
]:
    with pdfplumber.open(output / (source + '.pdf')) as document:
        page = document.pages[0]
        image = page.to_image(resolution=72 * 1400 / max(page.width, page.height), antialias=True).original
        if monochrome:
            image = image.convert('L')
        image.save(output / (target + '.png'))
        print(f'PASS {target}: {image.width} x {image.height} {image.mode}')
