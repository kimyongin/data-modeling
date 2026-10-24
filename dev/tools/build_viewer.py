#!/usr/bin/env python3
"""Bundle the empty offline viewer into the installable skill. No case JSON or Python model imports."""
import argparse
import hashlib
import html
import json
from pathlib import Path
from release_viewer import REPO, VIEWER, RELEASES, CURRENT, read_release

TARGET = REPO / 'skills' / 'data-modeling' / 'assets' / 'model-viewer.html'


def build_viewer():
    release = read_release()
    compatible = json.loads((VIEWER/'share-compatibility.json').read_text())
    compatible[release['renderer_version']] = hashlib.sha256(CURRENT.read_bytes()).hexdigest()
    metadata = dict(schema_version=release['schema_version'], share_format_version='1.0.0',
                    renderer_version=release['renderer_version'], compatible_releases=compatible)
    payload = dict(review=None, verification=None, build_metadata=None, viewer_metadata=metadata,
                   third_party_notices={p.name:p.read_text() for p in sorted((VIEWER/'vendor').glob('*.txt'))})
    text = json.dumps(payload, ensure_ascii=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
    css = (VIEWER/'review.css').read_text()
    scripts = [(VIEWER/name).read_text() for name in ['vendor/viz-global.js','vendor/share-validator.js','model-integrity.js','review-transfer.js','review.js']]
    output = ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
              '<meta name="viewport" content="width=device-width,initial-scale=1">'
              '<title>'+html.escape('데이터 모델링 뷰어')+'</title><style>'+css+'</style></head>'
              '<body><main id="app"></main><noscript>탭·ERD·상세 내용을 사용하려면 JavaScript를 활성화하세요.</noscript>'
              '<script type="application/json" id="review-data">'+text+'</script>'
              +''.join('<script>'+script+'</script>' for script in scripts)+'</body></html>')
    receipt = dict(kind='bundled-viewer', renderer_version=release['renderer_version'], model_versions=release['model_versions'],
                   viewer_release_sha256=hashlib.sha256(CURRENT.read_bytes()).hexdigest(),
                   output_sha256=hashlib.sha256(output.encode()).hexdigest(), empty_data=True)
    return output, receipt


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, default=TARGET)
    p.add_argument('--receipt', type=Path)
    p.add_argument('--check', action='store_true', help='Compare the bundled viewer without rewriting files')
    a = p.parse_args()
    try:
        if a.output.suffix.lower() not in ('.html','.htm'):
            raise ValueError('Viewer output must be HTML')
        output, receipt = build_viewer()
        if a.check:
            if not a.output.is_file() or a.output.read_bytes()!=output.encode():
                raise ValueError('Bundled viewer is missing or stale; run dev/tools/build_viewer.py')
            print('Bundled viewer matches its development sources')
            return
        a.output.parent.mkdir(parents=True, exist_ok=True)
        a.output.write_text(output, encoding='utf-8')
        target = a.receipt or (RELEASES/'viewer-build.json' if a.output.resolve()==TARGET.resolve() else a.output.with_suffix('.build.json'))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(receipt, ensure_ascii=False, indent=2)+'\n')
        print(a.output.resolve())
    except (ValueError, KeyError, OSError) as exc:
        p.error(str(exc))


if __name__ == '__main__':
    main()
