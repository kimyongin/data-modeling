"""Validate once, then write only JSON and its independent generation receipt."""
import copy
import hashlib
import json
from pathlib import Path
from .contract import VERSIONS, load_json_bytes, dependencies
from .validation import validate_document
from .output import write_outputs

def build_to_file(source, target=None, clear_observations=False):
    source = Path(source)
    target = Path(target) if target else source.with_name(source.stem+'.model.json')
    if target.suffix.lower() != '.json':
        raise ValueError('output_type: cases are JSON only')
    if source.resolve() in {target.resolve(), target.with_suffix('.build.json').resolve()}:
        raise ValueError('source_path: preserve source; choose separate output paths')
    input_bytes = source.read_bytes()
    document = load_json_bytes(input_bytes)
    if clear_observations and isinstance(document, dict):
        document = copy.deepcopy(document)
        document['observations'] = []
    report = validate_document(document)
    output = json.dumps(document, ensure_ascii=False, indent=2, allow_nan=False)+'\n'
    receipt = dict(kind='model-json', builder_version=VERSIONS['builder'], document_version=document['version'],
                   input_sha256=hashlib.sha256(input_bytes).hexdigest(), output_sha256=hashlib.sha256(output.encode()).hexdigest(),
                   dependencies=dependencies(), observations_cleared=clear_observations, warnings=report['warnings'])
    write_outputs(target, output, receipt)
    return target.resolve(), report
