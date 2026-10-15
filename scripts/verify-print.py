"""Check real Chromium PDF text, pages and geometry on every supported OS."""
import json
import re
import sys
from pathlib import Path
import pdfplumber
from pypdf import PdfReader

output = Path(sys.argv[1] if len(sys.argv) > 1 else '.qa/print')
manifest = json.loads((output / 'manifest.json').read_text(encoding='utf-8'))
report = []
normalize = lambda value: re.sub(r'\s+', '', value)
for case in manifest['cases']:
    pdf = output / (case['name'] + '.pdf')
    reader = PdfReader(pdf)
    assert len(reader.pages) >= case['minimumPages'], (case['name'], len(reader.pages))
    expected = (792, 612) if case['paper'] == 'letter' else (841.89, 595.28)
    pages_text = [page.extract_text() for page in reader.pages]
    text = normalize('\n'.join(pages_text))
    for marker in case['markers']:
        assert normalize(marker) in text, (case['name'], 'missing text', marker[:70])
    if case.get('coordinateRows'):
        # One row per performer and set, independent of table pagination.
        pattern = case.get('coordinateRowPattern', r'\d+\. Picture \d{3}')
        assert sum(len(re.findall(pattern, page)) for page in pages_text) == case['coordinateRows']
    with pdfplumber.open(pdf) as document:
        checked = 0
        for index, page in enumerate(document.pages):
            assert abs(page.width - expected[0]) < 1.5 and abs(page.height - expected[1]) < 1.5
            backgrounds = [rect for rect in page.rects if rect.get('fill') and rect['x0'] <= .5 and rect['x1'] >= page.width - .5 and rect['top'] <= .5 and rect['bottom'] >= page.height - .5]
            if backgrounds:
                color = backgrounds[-1]['non_stroking_color']
                assert all(channel >= .99 for channel in color), (case['name'], index, 'nonwhite page background', color)
            for char in page.chars:
                if not char['text'].strip():
                    continue
                checked += 1
                assert char['x0'] >= -0.5 and char['x1'] <= page.width + 0.5, (case['name'], index, 'horizontal clipping', char)
                assert char['top'] >= -0.5 and char['bottom'] <= page.height + 0.5, (case['name'], index, 'vertical clipping', char)
        assert checked > 100
    report.append({'name': case['name'], 'pages': len(reader.pages), 'checkedCharacters': checked, 'pagePoints': expected})
    print(f"PASS {case['name']}: {len(reader.pages)} pages, {checked} visible character boxes, complete text")
(output / 'pdf-verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
