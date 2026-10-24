"""Versioned input contract and fixed-renderer integrity checks (no network at build time)."""
import hashlib
import json
import math
from importlib.metadata import version
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_VERSION = '1.0.0'


def load_json(path):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('Duplicate JSON key: ' + key)
            result[key] = value
        return result
    def constant(value):
        raise ValueError('Non-finite JSON number: ' + value)
    return json.loads(Path(path).read_text(encoding='utf-8'), object_pairs_hook=pairs, parse_constant=constant)


def canonical_digest(data):
    return hashlib.sha256(json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def dependency_versions():
    names = [line.split('==')[0] for line in (ROOT / 'requirements.txt').read_text().splitlines() if line and not line.startswith('#')]
    try:
        found = {name: version(name) for name in names}
    except Exception as exc:
        raise ValueError('Install the pinned dependencies: python -m pip install -r <skill>/requirements.txt') from exc
    expected = dict(line.split('==') for line in (ROOT / 'requirements.txt').read_text().splitlines() if line and not line.startswith('#'))
    if found != expected:
        raise ValueError('Schema dependency versions differ. Install requirements.txt in a dedicated Python 3.11+ environment.')
    return found


def renderer_release():
    release = load_json(ROOT / 'renderer-release.json')
    snapshot = ROOT / 'releases' / (release['renderer_version'] + '.json')
    if not snapshot.is_file() or snapshot.read_bytes() != (ROOT / 'renderer-release.json').read_bytes():
        raise ValueError('Renderer release differs from its immutable history entry')
    if release.get('schema_version') != SCHEMA_VERSION:
        raise ValueError('Renderer release/schema mismatch')
    for name, expected in release['files'].items():
        path = ROOT / name
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError('Fixed renderer integrity check failed: ' + name + '. Restore this release; do not patch it for a new case.')
    return release


def validate_document(data, allow_compatibility=False):
    if not isinstance(data, dict):
        raise ValueError('Review input must be an object')
    if data.get('schema_version') != SCHEMA_VERSION:
        raise ValueError('Unsupported or missing schema_version. Use an explicit migration; expected ' + SCHEMA_VERSION)
    dependency_versions()
    from jsonschema import Draft202012Validator
    schema = load_json(ROOT / ('schemas/review-' + SCHEMA_VERSION + '.schema.json'))
    Draft202012Validator.check_schema(schema)
    errors = sorted(Draft202012Validator(schema).iter_errors(data), key=lambda e: str(list(e.absolute_path)))
    if errors:
        lines = []
        for error in errors[:12]:
            path = '/' + '/'.join(str(part) for part in error.absolute_path)
            lines.append(path + ': ' + error.message)
        raise ValueError('Review JSON Schema validation failed:\n' + '\n'.join(lines))
    if data['review_profile'] == 'compatibility' and not allow_compatibility:
        raise ValueError('Compatibility input needs explicit --allow-compatibility. New cases must use standard.')
    release = renderer_release()
    if data['renderer_version'] != release['renderer_version']:
        raise ValueError('Pinned renderer_version ' + data['renderer_version'] + ' does not match installed renderer ' + release['renderer_version'])
    return release
