#!/usr/bin/env python3
"""Check the empty-viewer CLI, reproducibility, receipts and absence of embedded case data."""
import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from review_contract import ROOT, renderer_release


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    checks = []
    def check(name, fn):
        try:
            fn(); checks.append(dict(name=name, status='pass'))
        except Exception as exc:
            checks.append(dict(name=name, status='fail', error=str(exc)))
    def require(value):
        if not value: raise AssertionError('Expected empty-viewer contract')
    def command(*values):
        return subprocess.run([sys.executable, str(ROOT/'scripts/render_review.py'), *map(str, values)], capture_output=True, text=True)
    with tempfile.TemporaryDirectory(prefix='model-viewer-cli-') as tmp:
        folder = Path(tmp); first = folder/'one.html'; second = folder/'two.html'
        def generate():
            for out in (first, second):
                result = command('--viewer', '--output', out); require(result.returncode == 0)
        check('empty viewer needs no input and generates receipts', generate)
        if first.exists() and second.exists():
            html = first.read_text(); payload = json.loads(re.search(r'<script type="application/json" id="review-data">(.*?)</script>', html, re.S).group(1));receipt=json.loads(first.with_suffix('.build.json').read_text())
            check('review, verification and case metadata are null', lambda: require(all(payload[k] is None for k in ('review','verification','build_metadata'))))
            check('only renderer metadata and notices accompany the null data', lambda: require(set(payload)=={'review','verification','build_metadata','viewer_metadata','third_party_notices'}))
            check('viewer receipt never carries case hashes', lambda: require(receipt['kind']=='empty-viewer' and receipt['input_sha256'] is None and receipt['verification_sha256'] is None))
            check('receipt identifies the exact generated HTML', lambda: require(receipt['output_sha256']==hashlib.sha256(first.read_bytes()).hexdigest()))
            check('same release generates identical viewer bytes and receipts', lambda: require(first.read_bytes()==second.read_bytes() and first.with_suffix('.build.json').read_bytes()==second.with_suffix('.build.json').read_bytes()))
            check('viewer explicitly supports previous and current releases', lambda: require({'1.0.1',renderer_release()['renderer_version']}<=set(payload['viewer_metadata']['compatible_releases'])))
            check('viewer does not embed an input hash field', lambda: require('input_sha256' not in json.dumps(payload)))
            check('viewer never loads remote assets', lambda: require(not re.search(r'<(?:script|link)[^>]+(?:src|href)=["\']https?://',html)))
        for name,extra in [('input',[ROOT/'references/example-review.json']),('verification',['--verification',folder/'does-not-exist.json']),('compatibility',['--allow-compatibility'])]:
            def invalid(extra=extra):
                target=folder/'preserved.html';target.write_text('existing viewer');result=command('--viewer',*extra,'--output',target);require(result.returncode!=0 and target.read_text()=='existing viewer')
            check('viewer rejects '+name+' option without touching output',invalid)
        check('missing normal input is rejected',lambda:require(command('--output',folder/'missing.html').returncode!=0))
    report=dict(passed=sum(x['status']=='pass' for x in checks),failed=sum(x['status']=='fail' for x in checks),checks=checks)
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:report[k] for k in ('passed','failed')}))
    if report['failed']:raise SystemExit(1)


if __name__=='__main__':main()
