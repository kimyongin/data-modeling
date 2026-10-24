#!/usr/bin/env python3
"""Seal a new viewer source release. The JSON tools never import this module."""
import argparse
import hashlib
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
VIEWER = REPO / 'dev' / 'viewer'
RELEASES = REPO / 'dev' / 'releases'
CURRENT = RELEASES / 'viewer-release.json'


def read_release():
    release = json.loads(CURRENT.read_text())
    snapshot = RELEASES / ('viewer-'+release['renderer_version']+'.json')
    if snapshot.read_bytes() != CURRENT.read_bytes():
        raise ValueError('Viewer release differs from its immutable history entry')
    for name, expected in release['files'].items():
        p = REPO / name
        if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest() != expected:
            raise ValueError('Viewer source changed: '+name+'. Create a new viewer release before building.')
    return release


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--version', required=True)
    p.add_argument('--notes', required=True)
    a = p.parse_args()
    if not re.fullmatch(r'\d+\.\d+\.\d+', a.version) or not a.notes.strip():
        p.error('A semantic version and release notes are required')
    previous = json.loads(CURRENT.read_text()) if CURRENT.exists() else {'renderer_version': '1.1.1'}
    if tuple(map(int,a.version.split('.'))) <= tuple(map(int,previous['renderer_version'].split('.'))):
        p.error('Use a new viewer version; released versions are immutable')
    snapshot = RELEASES / ('viewer-'+a.version+'.json')
    if snapshot.exists():
        p.error('Viewer history entry already exists')
    paths = [x for x in VIEWER.rglob('*') if x.is_file() and not set(x.parts)&{'node_modules','__pycache__'} and x.name!='.DS_Store']
    paths += list((REPO/'skills/data-modeling/references/schemas').glob('*.json'))
    paths += [REPO/'dev/tools'/name for name in ['build_viewer.py','release_viewer.py','build-transfer-validator.cjs']]
    release = dict(renderer_version=a.version, schema_version='1.0.0', model_versions=['1.0.0','1.1.0'], notes=a.notes,
                   files={str(x.relative_to(REPO)):hashlib.sha256(x.read_bytes()).hexdigest() for x in sorted(paths)})
    content = json.dumps(release, ensure_ascii=False, indent=2)+'\n'
    snapshot.write_text(content);CURRENT.write_text(content)
    print('Sealed viewer '+a.version+' ('+str(len(paths))+' development files)')


if __name__ == '__main__':
    main()
