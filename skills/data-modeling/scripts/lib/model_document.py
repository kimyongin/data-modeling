"""Validate and build primary model JSON; viewer assets and build tools are not read."""
import copy
import hashlib
import json
import math
from pathlib import Path
from .contract import SCHEMAS, BUILDER_VERSION, load_json, dependency_versions
from .modeling_review import assess_review
from .model_integrity import validate_samples, validate_observations
from .references import validate_references
from .output import write_outputs
MODEL_FORMAT = 'data-modeling-model'
MAX_BYTES = 20 * 1024 * 1024

def browser_values(value, depth=0):
    if depth > 80:
        raise ValueError('JSON nesting exceeds the viewer limit of 80')
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if (isinstance(value,int) and abs(value)>9007199254740991) or (isinstance(value,float) and (not math.isfinite(value) or (value.is_integer() and abs(value)>9007199254740991))):
            raise ValueError('Non-finite or unsafe integer: encode large identifiers as strings')
    if isinstance(value, dict):
        for child in value.values(): browser_values(child, depth+1)
    elif isinstance(value, list):
        for child in value: browser_values(child, depth+1)


def validate_model(document, allow_compatibility=False):
    dependency_versions()
    from jsonschema import Draft202012Validator
    version=document.get('format_version') if isinstance(document,dict) else None
    if version not in ('1.0.0','1.1.0'):raise ValueError('Unsupported model format version')
    schema=load_json(SCHEMAS/('model-'+version+'.schema.json'))
    errors=list(Draft202012Validator(schema).iter_errors(document))
    if errors:
        error=errors[0];raise ValueError('Model JSON Schema: /'+'/'.join(map(str,error.absolute_path))+': '+error.message)
    data=document['review']
    if data['review_profile']=='compatibility' and not allow_compatibility:
        raise ValueError('Compatibility input needs explicit --allow-compatibility')
    browser_values(document)
    validate_references(data, executable=False)
    assess_review(data)
    validate_samples(data)
    validate_observations(document)
    metadata=document.get('build_metadata')
    if metadata and (metadata['schema_version']!=data['schema_version'] or metadata['review_profile']!=data['review_profile']):
        raise ValueError('Model metadata schema/profile does not match review')
    report=document.get('verification')
    if report is not None:
        ids=[r['id'] for r in report['results']]
        if len(ids)!=len(set(ids)) or set(ids)!={s['id'] for s in data['scenarios']}:
            raise ValueError('Model verification IDs do not match scenarios')
    if len((json.dumps(document,ensure_ascii=False,allow_nan=False)+'\n').encode('utf-8'))>MAX_BYTES:
        raise ValueError('Model JSON exceeds 20MB')


def serialize_document(document):
    content=json.dumps(document,ensure_ascii=False,indent=2,allow_nan=False)+'\n'
    if len(content.encode('utf-8'))>MAX_BYTES:raise ValueError('Model JSON exceeds 20MB')
    return content



def build_to_file(input_path, target, verification_path=None, allow_compatibility=False, clear_verification=False):
    input_path, target = Path(input_path), Path(target)
    verification_path = Path(verification_path) if verification_path else None
    if target.suffix.lower() != '.json':
        raise ValueError('Case output must be JSON. Use the viewer bundled in assets/model-viewer.html.')
    destinations = {target.resolve(), target.with_suffix('.build.json').resolve()}
    if input_path.resolve() in destinations or (verification_path and verification_path.resolve() in destinations):
        raise ValueError('Keep the source and its results; choose separate output and receipt paths')
    data = load_json(input_path)
    digest = hashlib.sha256(input_path.read_bytes()).hexdigest()
    verification_digest = None
    if not isinstance(data, dict):
        raise ValueError('Model input must be an object')
    if data.get('format') == MODEL_FORMAT:
        if verification_path:
            raise ValueError('An importable model contains optional text results; do not attach execution data')
        document = copy.deepcopy(data) if clear_verification else data
        if clear_verification:
            document.pop('verification', None)
        validate_model(document, allow_compatibility=allow_compatibility)
    else:
        if clear_verification:
            raise ValueError('--clear-verification applies only to authored model JSON')
        from .legacy import make_document
        report = load_json(verification_path) if verification_path else None
        if report is not None:
            verification_digest = hashlib.sha256(verification_path.read_bytes()).hexdigest()
        document = make_document(data, report, digest, allow_compatibility)
    content = serialize_document(document)
    receipt = dict(kind='model-json', builder_version=BUILDER_VERSION,
                   format_version=document['format_version'], schema_version=document['review']['schema_version'],
                   review_profile=document['review']['review_profile'], input_sha256=digest,
                   verification_sha256=verification_digest, output_sha256=hashlib.sha256(content.encode()).hexdigest(),
                   dependencies=dependency_versions(), verification_cleared=clear_verification,
                   design_review=assess_review(document['review']))
    write_outputs(target, content, receipt)
    return target.resolve()
