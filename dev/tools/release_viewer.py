#!/usr/bin/env python3
"""Seal viewer runtime inputs. Skill/builder versions are independent."""
import argparse
import hashlib
import json
import re
from pathlib import Path
REPO = Path(__file__).resolve().parents[2]
VIEWER = REPO/'dev/viewer'
RELEASES = REPO/'dev/releases'
CURRENT = RELEASES/'viewer-release.json'


def source_hashes():
    paths = [p for p in VIEWER.rglob('*') if p.is_file() and not set(p.parts)&{'node_modules','__pycache__'} and p.name != 'UI.md']
    paths += list((REPO/'skills/data-modeling/references/schemas').glob('*.json'))
    paths += [REPO/'dev/tools'/n for n in ['build_viewer.py','release_viewer.py','bundle_viewer.cjs','build-transfer-validator.cjs']]
    return {str(p.relative_to(REPO)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}


def read_release():
    release = json.loads(CURRENT.read_text())
    snapshot = RELEASES/('viewer-'+release['version']+'.json')
    if snapshot.read_bytes() != CURRENT.read_bytes() or release['files'] != source_hashes():
        raise ValueError('viewer_sources: release manifest differs from current sources')
    return release


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version',required=True)
    parser.add_argument('--notes',required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'\d+\.\d+\.\d+',args.version) or not args.notes.strip():
        parser.error('Use a semantic version and meaningful notes')
    if json.loads((VIEWER/'version.json').read_text())['version'] != args.version:
        parser.error('Update dev/viewer/version.json first')
    if CURRENT.exists():
        current=json.loads(CURRENT.read_text())['version']
        if tuple(map(int,args.version.split('.'))) <= tuple(map(int,current.split('.'))):
            parser.error('Use a newer viewer version')
    target=RELEASES/('viewer-'+args.version+'.json')
    if target.exists():
        parser.error('Published source manifests are immutable; use a new version')
    release=dict(version=args.version,document_version='2.0.0',notes=args.notes,files=source_hashes())
    content=json.dumps(release,ensure_ascii=False,indent=2)+'\n'
    RELEASES.mkdir(parents=True,exist_ok=True)
    target.write_text(content);CURRENT.write_text(content)
    print('Sealed viewer '+args.version)


if __name__=='__main__':
    main()
