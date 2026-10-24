#!/usr/bin/env python3
"""Verify the built viewer, execute its import/ERD checks, then package one skill ZIP."""
import argparse
import hashlib
import io
import json
import subprocess
import tempfile
import zipfile
from pathlib import Path
from build_viewer import build_viewer, TARGET
from release_viewer import REPO
SKILL=REPO/'skills/data-modeling'
ALLOWED={'SKILL.md','agents','references','scripts','assets','requirements.txt','version.json'}


def package_bytes(node='node'):
    unknown={p.name for p in SKILL.iterdir()}-ALLOWED-{'__pycache__','.DS_Store'}
    if unknown:
        raise ValueError('package_files: unexpected entries '+', '.join(sorted(unknown)))
    if any(p.is_symlink() for p in SKILL.rglob('*')):
        raise ValueError('package_symlink: resources must be self-contained')
    for name in ['SKILL.md','agents/openai.yaml','assets/model-viewer.html','assets/NOTICE.txt','scripts/build_model.py','scripts/validate_model.py','references/example-model.json','version.json']:
        if not (SKILL/name).is_file():
            raise ValueError('package_missing: '+name)
    expected,receipt=build_viewer(node=node)
    viewer=SKILL/'assets/model-viewer.html'
    if viewer.read_bytes()!=expected.encode():
        raise ValueError('package_viewer: missing, damaged or stale viewer; rebuild first')
    with tempfile.TemporaryDirectory(prefix='model-package-check-') as tmp:
        result=Path(tmp)/'bundle.json'
        check=subprocess.run([node,str(REPO/'dev/tests/check_bundle.mjs'),str(viewer),str(REPO/'examples/test-manifest.json'),str(result)],cwd=REPO,capture_output=True,text=True)
        if check.returncode or not result.exists():
            raise ValueError('package_bundle: '+check.stdout+' '+check.stderr)
        if json.loads(result.read_text())['failed']:
            raise ValueError('package_bundle: import/ERD regression failed')
        workspace=Path(tmp)/'workspace.json'
        check=subprocess.run([node,str(REPO/'dev/tests/check_workspace.mjs'),str(REPO/'examples/test-manifest.json'),str(workspace)],cwd=REPO,capture_output=True,text=True)
        if check.returncode or not workspace.exists() or json.loads(workspace.read_text())['failed']:
            raise ValueError('package_workspace: '+check.stdout+' '+check.stderr)
    files=sorted(p for p in SKILL.rglob('*') if p.is_file() and not set(p.parts)&{'__pycache__','node_modules','.git','.venv'} and p.name!='.DS_Store')
    entries={}
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for path in files:
            name=path.relative_to(SKILL).as_posix();raw=path.read_bytes();entries[name]=hashlib.sha256(raw).hexdigest()
            entry=zipfile.ZipInfo('data-modeling/'+name,date_time=(1980,1,1,0,0,0));entry.create_system=3;entry.external_attr=0o100644<<16;entry.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(entry,raw,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
    raw=stream.getvalue();versions=json.loads((SKILL/'version.json').read_text())
    manifest=dict(kind='installable-skill',skill_version=versions['skill'],builder_version=versions['builder'],viewer_version=receipt['viewer_version'],document_version='2.0.0',zip_sha256=hashlib.sha256(raw).hexdigest(),files=entries)
    return raw,manifest


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--manifest',type=Path)
    parser.add_argument('--node',default='node')
    parser.add_argument('--release',action='store_true')
    args=parser.parse_args()
    try:
        if args.output.suffix.lower()!='.zip' or any(p.resolve().is_relative_to(SKILL.resolve()) for p in [args.output,*([args.manifest] if args.manifest else [])]):
            raise ValueError('package_output: write ZIP/manifest outside the installable skill')
        raw,manifest=package_bytes(args.node);content=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
        record=REPO/'dev/releases'/('skill-'+manifest['skill_version']+'.json')
        if args.release and record.exists() and record.read_text()!=content:
            raise ValueError('package_release: increment skill version; builder/viewer versions are independent')
        args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_bytes(raw)
        if args.manifest:
            args.manifest.parent.mkdir(parents=True,exist_ok=True);args.manifest.write_text(content)
        if args.release:record.write_text(content)
        print(str(args.output.resolve())+' · '+str(len(manifest['files']))+' files')
    except (ValueError,OSError,subprocess.CalledProcessError) as exc:
        parser.error(str(exc))


if __name__=='__main__':
    main()
