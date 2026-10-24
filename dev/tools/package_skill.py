#!/usr/bin/env python3
"""Package only skills/data-modeling, including its prebuilt viewer, into one reproducible ZIP."""
import argparse
import ast
import hashlib
import io
import json
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SKILL = REPO / 'skills' / 'data-modeling'
ALLOWED = {'SKILL.md','agents','references','scripts','assets','requirements.txt'}


def builder_version():
    tree = ast.parse((SKILL/'scripts/lib/contract.py').read_text())
    for statement in tree.body:
        if isinstance(statement,ast.Assign) and any(isinstance(target,ast.Name) and target.id=='BUILDER_VERSION' for target in statement.targets):
            return ast.literal_eval(statement.value)
    raise ValueError('Builder version missing')


def package_bytes():
    unknown = {p.name for p in SKILL.iterdir()}-ALLOWED-{'__pycache__','.DS_Store'}
    if unknown:
        raise ValueError('Unexpected files in installable skill: '+', '.join(sorted(unknown)))
    required = ['SKILL.md','agents/openai.yaml','assets/model-viewer.html','assets/NOTICE.txt','requirements.txt',
                'scripts/build_model.py','scripts/validate_model.py','scripts/migrate_model.py','references/example-model.json']
    for name in required:
        if not (SKILL/name).is_file():
            raise ValueError('Required bundled skill file missing: '+name)
    html = (SKILL/'assets/model-viewer.html').read_text()
    marker = '<script type="application/json" id="review-data">'
    data = json.loads(html.split(marker,1)[1].split('</script>',1)[0])
    if any(data[key] is not None for key in ['review','verification','build_metadata']):
        raise ValueError('Package viewer must contain no case data')
    if any(p.is_symlink() for p in SKILL.rglob('*')):
        raise ValueError('Packaged resources must not be symlinks')
    files = sorted(p for p in SKILL.rglob('*') if p.is_file() and not set(p.parts)&{'__pycache__','node_modules','.git','.venv'} and p.name!='.DS_Store')
    if any(p.is_symlink() for p in files):
        raise ValueError('Packaged files must be self-contained, not symlinks')
    stream = io.BytesIO()
    entries = {}
    with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for p in files:
            rel = p.relative_to(SKILL).as_posix()
            raw = p.read_bytes();entries[rel]=hashlib.sha256(raw).hexdigest()
            entry = zipfile.ZipInfo('data-modeling/'+rel,date_time=(1980,1,1,0,0,0));entry.create_system=3
            entry.compress_type=zipfile.ZIP_DEFLATED;entry.external_attr=(0o100644<<16)
            archive.writestr(entry,raw,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
    raw = stream.getvalue()
    manifest = dict(kind='installable-skill',skill='data-modeling',builder_version=builder_version(),
                    viewer_version=data['viewer_metadata']['renderer_version'],model_versions=['1.0.0','1.1.0'],
                    zip_sha256=hashlib.sha256(raw).hexdigest(),files=entries)
    return raw,manifest


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--manifest',type=Path)
    p.add_argument('--release',action='store_true',help='Record immutable skill package manifest under dev/releases')
    a = p.parse_args()
    try:
        if a.output.suffix.lower()!='.zip':
            raise ValueError('Package output must be a ZIP')
        if a.output.resolve().is_relative_to(SKILL.resolve()) or (a.manifest and a.manifest.resolve().is_relative_to(SKILL.resolve())):
            raise ValueError('Write package outputs outside the installable skill')
        raw,manifest = package_bytes();text=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
        record=REPO/'dev/releases'/('skill-'+manifest['builder_version']+'.json')
        if a.release and record.exists() and record.read_text()!=text:
            raise ValueError('Package release is immutable; use a new builder version')
        a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_bytes(raw)
        if a.manifest:
            a.manifest.parent.mkdir(parents=True,exist_ok=True);a.manifest.write_text(text)
        if a.release:record.write_text(text)
        print(str(a.output.resolve())+' ('+str(len(manifest['files']))+' files; viewer included)')
    except (ValueError,KeyError,OSError,IndexError) as exc:
        p.error(str(exc))


if __name__=='__main__':
    main()
