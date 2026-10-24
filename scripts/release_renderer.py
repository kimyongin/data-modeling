#!/usr/bin/env python3
"""Maintainer-only release: seal runtime files under a NEW semantic version."""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = ['scripts/model_integrity.py', 'scripts/migrate_model.py', 'scripts/modeling_review.py', 'scripts/build_model.py', 'scripts/render_review.py', 'scripts/review_contract.py', 'scripts/verify_sqlite.py', 'scripts/validate_review.py', 'requirements.txt', 'tools/build-transfer-validator.cjs', 'tools/create_share_schema.py', 'tools/create_model_schema.py', 'tools/package.json', 'tools/package-lock.json']


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--version', required=True)
    p.add_argument('--notes', required=True)
    args = p.parse_args()
    if not re.fullmatch(r'\d+\.\d+\.\d+', args.version) or not args.notes.strip():
        p.error('A semantic version and release notes are required')
    target = ROOT / 'renderer-release.json'
    old = json.loads(target.read_text()) if target.exists() else None
    number = lambda value: tuple(map(int, value.split('.')))
    if old and number(args.version) <= number(old['renderer_version']):
        p.error('A released version cannot be overwritten; increment the renderer version')
    from review_contract import dependency_versions, SCHEMA_VERSION
    dependency_versions()
    from jsonschema import Draft202012Validator
    schema = json.loads((ROOT / ('schemas/review-' + SCHEMA_VERSION + '.schema.json')).read_text())
    Draft202012Validator.check_schema(schema)
    for contract in (ROOT / 'schemas').glob('*.json'):
        Draft202012Validator.check_schema(json.loads(contract.read_text()))
    files = [ROOT / name for name in RUNTIME] + sorted((ROOT / 'assets').rglob('*')) + sorted((ROOT / 'schemas').glob('*.json'))
    files = sorted(path for path in files if path.is_file() and path.name != '.DS_Store')
    release = dict(renderer_version=args.version, schema_version=SCHEMA_VERSION, notes=args.notes,
                   dependencies=dependency_versions(), files={str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in files})
    folder = ROOT / 'releases';folder.mkdir(exist_ok=True)
    snapshot = folder / (args.version + '.json')
    if snapshot.exists():
        p.error('Release history entry already exists')
    text = json.dumps(release, ensure_ascii=False, indent=2) + '\n'
    snapshot.write_text(text, encoding='utf-8');target.write_text(text, encoding='utf-8')
    print('Sealed renderer ' + args.version + ' (' + str(len(release['files'])) + ' runtime files)')


if __name__ == '__main__':
    main()
