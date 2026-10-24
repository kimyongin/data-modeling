"""Portable JSON contracts and model-tool version. No renderer or release-file dependency."""
import hashlib
import json
from importlib.metadata import version
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMAS = ROOT / 'references' / 'schemas'
BUILDER_VERSION = '2.0.0'
MODEL_VERSIONS = ('1.0.0', '1.1.0')


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
    expected = dict(line.split('==') for line in (ROOT / 'requirements.txt').read_text().splitlines() if line and not line.startswith('#'))
    try:
        found = {name: version(name) for name in expected}
    except Exception as exc:
        raise ValueError('Install requirements.txt in a dedicated Python 3.11+ environment.') from exc
    if found != expected:
        raise ValueError('Schema dependency versions differ. Install the pinned requirements.txt.')
    return found


def validate_schema(data, filename):
    dependency_versions()
    from jsonschema import Draft202012Validator
    errors = list(Draft202012Validator(load_json(SCHEMAS / filename)).iter_errors(data))
    if errors:
        error = errors[0]
        raise ValueError('JSON Schema: /' + '/'.join(map(str, error.absolute_path)) + ': ' + error.message)
