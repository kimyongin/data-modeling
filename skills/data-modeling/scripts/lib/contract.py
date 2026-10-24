"""Single document contract. No viewer or development dependency."""
import json
from importlib.metadata import version
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / 'references/schemas/model-2.0.0.schema.json'
VERSIONS = json.loads((ROOT / 'version.json').read_text())
MAX_BYTES = 20 * 1024 * 1024

def load_json(path):
    return load_json_bytes(Path(path).read_bytes())


def load_json_bytes(raw):
    if len(raw) > MAX_BYTES:
        raise ValueError('file_size: JSON must be at most 20MB')
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('duplicate_key: ' + key)
            result[key] = value
        return result
    def constant(value):
        raise ValueError('number: ' + value)
    try:
        return json.loads(raw.decode('utf-8-sig'), object_pairs_hook=pairs, parse_constant=constant)
    except RecursionError as exc:
        raise ValueError('depth: JSON nesting exceeds the supported limit') from exc

def dependencies():
    expected = dict(line.split('==') for line in (ROOT/'requirements.txt').read_text().splitlines() if line and not line.startswith('#'))
    try:
        actual = {name: version(name) for name in expected}
    except Exception as exc:
        raise ValueError('dependencies: Install requirements.txt in a Python 3.11+ environment') from exc
    if actual != expected:
        raise ValueError('dependencies: Install pinned requirements.txt')
    return actual
