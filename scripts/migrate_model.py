#!/usr/bin/env python3
"""Explicitly upgrade a display document; preserve its source and discard unbound active results."""
import argparse,copy,hashlib,json
from pathlib import Path
from review_contract import load_json,renderer_release
from build_model import validate_model,serialize_document
from render_review import write_outputs


def migrate_document(document):
    if document.get('format')!='data-modeling-model' or document.get('format_version')!='1.0.0':raise ValueError('Migration requires a primary model 1.0.0 document')
    validate_model(document,allow_compatibility=True)
    result=copy.deepcopy(document);result['format_version']='1.1.0';result['review']['schema_version']='1.1.0'
    result.pop('verification',None);result.pop('build_metadata',None)
    validate_model(result,allow_compatibility=True)
    return result


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('input',type=Path);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    try:
        if a.output.suffix.lower()!='.json' or a.output.resolve()==a.input.resolve() or a.output.with_suffix('.build.json').resolve()==a.input.resolve():raise ValueError('Choose a separate JSON output; the original and its recorded observations are preserved')
        if a.output.exists() or a.output.with_suffix('.build.json').exists():raise ValueError('Migration does not overwrite existing outputs')
        source=load_json(a.input);result=migrate_document(source);content=serialize_document(result)
        receipt=dict(kind='model-migration',from_version='1.0.0',to_version='1.1.0',renderer_version=renderer_release()['renderer_version'],input_sha256=hashlib.sha256(a.input.read_bytes()).hexdigest(),output_sha256=hashlib.sha256(content.encode()).hexdigest(),verification='Unbound active results removed; source file and historical results preserved unchanged')
        write_outputs(a.output,content,receipt);print(a.output.resolve())
    except (ValueError,KeyError,TypeError) as exc:p.error(str(exc))

if __name__=='__main__':main()
