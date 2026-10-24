#!/usr/bin/env python3
"""Default case builder: validate or convert modeling data to directly importable JSON. Never generates HTML."""
import argparse
import hashlib
import json
import math
from pathlib import Path
from review_contract import ROOT, load_json, renderer_release, dependency_versions
from modeling_review import assess_review
from render_review import public_payload, validate_references, write_outputs

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
    renderer_release()
    dependency_versions()
    from jsonschema import Draft202012Validator
    schema=load_json(ROOT/'schemas/model-1.0.0.schema.json')
    errors=list(Draft202012Validator(schema).iter_errors(document))
    if errors:
        error=errors[0];raise ValueError('Model JSON Schema: /'+'/'.join(map(str,error.absolute_path))+': '+error.message)
    data=document['review']
    if data['review_profile']=='compatibility' and not allow_compatibility:
        raise ValueError('Compatibility input needs explicit --allow-compatibility')
    browser_values(document)
    validate_references(data, executable=False)
    assess_review(data)
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


def make_document(data, report=None, **options):
    payload=public_payload(data,report,**options)
    payload['review'].pop('renderer_version',None)
    document=dict(format=MODEL_FORMAT,format_version='1.0.0',**payload)
    validate_model(document,allow_compatibility=options.get('allow_compatibility',False))
    return document


def serialize_document(document):
    content=json.dumps(document,ensure_ascii=False,indent=2,allow_nan=False)+'\n'
    if len(content.encode('utf-8'))>MAX_BYTES:raise ValueError('Model JSON exceeds 20MB')
    return content


def validate_report(data, report, digest):
    if not isinstance(report,dict) or not isinstance(report.get('results'),list):raise ValueError('Verification report requires results')
    if report.get('input_sha256')!=digest:raise ValueError('Verification report is stale or belongs to another input')
    for key in ('engine','scope','executed_at'):
        if not isinstance(report.get(key),str) or not report[key].strip():raise ValueError('Verification report requires '+key)
    ids=[r['id'] for r in report['results']]
    if len(ids)!=len(set(ids)) or set(ids)!={s['id'] for s in data['scenarios']}:raise ValueError('Verification IDs do not match scenarios')
    if any(r.get('status') not in ('pass','fail','not_run') for r in report['results']):raise ValueError('Invalid verification status')


def build_to_file(input_path, target, verification_path=None, allow_compatibility=False):
    """One JSON-only implementation shared by both CLI entry points."""
    input_path, target = Path(input_path), Path(target)
    verification_path = Path(verification_path) if verification_path else None
    if target.suffix.lower() != '.json':
        raise ValueError('Case output must be JSON. HTML requires explicit --format html in render_review.py.')
    destinations = {target.resolve(), target.with_suffix('.build.json').resolve()}
    if input_path.resolve() in destinations or (verification_path and verification_path.resolve() in destinations):
        raise ValueError('Keep the authored input and verification; choose different output and receipt paths')
    release=renderer_release();data=load_json(input_path);digest=hashlib.sha256(input_path.read_bytes()).hexdigest();verification_digest=None
    if not isinstance(data,dict):raise ValueError('Model input must be an object')
    if data.get('format')==MODEL_FORMAT:
        if verification_path:raise ValueError('An importable model contains optional text verification; do not attach execution data')
        validate_model(data,allow_compatibility=allow_compatibility);document=data
    else:
        report=load_json(verification_path) if verification_path else None
        if report is not None:
            validate_report(data,report,digest);verification_digest=hashlib.sha256(verification_path.read_bytes()).hexdigest()
        document=make_document(data,report,allow_compatibility=allow_compatibility,input_sha256=digest,verification_sha256=verification_digest)
    content=serialize_document(document)
    receipt=dict(kind='model-json',format_version='1.0.0',schema_version=document['review']['schema_version'],renderer_version=release['renderer_version'],review_profile=document['review']['review_profile'],input_sha256=digest,verification_sha256=verification_digest,renderer_release_sha256=hashlib.sha256((ROOT/'renderer-release.json').read_bytes()).hexdigest(),output_sha256=hashlib.sha256(content.encode()).hexdigest(),dependencies=dependency_versions())
    receipt['design_review']=assess_review(document['review'])
    write_outputs(target,content,receipt)
    return target.resolve()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('input',type=Path)
    p.add_argument('--output',type=Path,help='Defaults to <input-stem>.model.json')
    p.add_argument('--verification',type=Path)
    p.add_argument('--allow-compatibility',action='store_true')
    args=p.parse_args();target=args.output or args.input.with_name(args.input.stem+'.model.json')
    try:
        print(str(build_to_file(args.input,target,args.verification,args.allow_compatibility)))
    except (ValueError,KeyError,TypeError) as exc:p.error(str(exc))


if __name__=='__main__':main()
