#!/usr/bin/env python3
"""Portable skill/package regressions and JSON/viewer independence. No browser or SQL execution."""
import argparse
import ast
import copy
import hashlib
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from support import REPO, SKILL, load_json, validate_model


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);p.add_argument('--node');a=p.parse_args();checks=[]
    manifest=load_json(REPO/'examples/test-manifest.json');cases=[(c,REPO/c['input']) for c in manifest]
    def require(value,message='Architecture invariant failed'):
        if not value:raise AssertionError(message)
    def check(name,action):
        try:action();checks.append(dict(name=name,status='pass'))
        except Exception as exc:checks.append(dict(name=name,status='fail',error=str(exc)))
    def command(*args,cwd=None):
        result=subprocess.run([sys.executable,*map(str,args)],cwd=cwd,capture_output=True,text=True)
        require(result.returncode==0,result.stderr);return result
    def copy_skill(target):
        shutil.copytree(SKILL,target,ignore=shutil.ignore_patterns('__pycache__','.venv','.DS_Store'))
    with tempfile.TemporaryDirectory(prefix='modeling architecture ') as tmp:
        folder=Path(tmp);isolated=folder/'isolated skill';copy_skill(isolated);shutil.rmtree(isolated/'assets')
        def runtime_only():
            for case,source in cases:
                target=folder/(case['name']+'.model.json')
                command(isolated/'scripts/validate_model.py',source,cwd=folder)
                command(isolated/'scripts/build_model.py',source,'--output',target,cwd=folder)
                require(load_json(target)==load_json(source));receipt=load_json(target.with_suffix('.build.json'))
                require(receipt['builder_version']=='2.0.0');require(not any(k.startswith(('renderer','viewer')) for k in receipt))
            require(not list(folder.rglob('*.html')),'JSON tools created HTML')
        check('all public examples validate/build with only installed JSON files, no assets/dev/release history',runtime_only)
        def edits_do_not_affect_json():
            source=cases[0][1];target=folder/'independent.model.json'
            command(isolated/'scripts/build_model.py',source,'--output',target);before=(target.read_bytes(),target.with_suffix('.build.json').read_bytes())
            (isolated/'assets').mkdir();(isolated/'assets/model-viewer.html').write_text('Deliberately not a viewer')
            command(isolated/'scripts/build_model.py',source,'--output',target)
            require(before==(target.read_bytes(),target.with_suffix('.build.json').read_bytes()),'Viewer edit changed JSON or receipt')
        check('changing or corrupting the viewer cannot change JSON output or receipt',edits_do_not_affect_json)
        def no_imports():
            for file in (SKILL/'scripts').rglob('*.py'):
                for node in ast.walk(ast.parse(file.read_text())):
                    names=[n.name for n in node.names] if isinstance(node,ast.Import) else [node.module or ''] if isinstance(node,ast.ImportFrom) else []
                    require(not any(x.split('.')[0] in ['render_review','review_contract','release_viewer','build_viewer','dev','sqlite3'] for x in names),str(file))
        check('runtime modules have no renderer/development/SQL-engine imports',no_imports)
        def metadata_is_trace_only():
            data=load_json(cases[0][1]);data['build_metadata']=dict(schema_version=data['review']['schema_version'],renderer_version='99.0.0',review_profile=data['review']['review_profile'],input_sha256='a'*64,verification_sha256=None,renderer_release_sha256='b'*64);validate_model(data)
        check('legacy viewer metadata is optional trace data, not an installed-viewer pin',metadata_is_trace_only)
        def migrate():
            raw=load_json(REPO/'dev/tests/example-review.json');review=copy.deepcopy({k:v for k,v in raw.items() if k not in ['sqlite','scenarios','renderer_version']})
            allowed={'id','title','requirements','entities','explanation','sample_refs','sample_note'};review['scenarios']=[{k:v for k,v in s.items() if k in allowed} for s in raw['scenarios']]
            data=dict(format='data-modeling-model',format_version='1.0.0',review=review,verification=dict(engine='Test fixture',scope='Fixture only, no execution',executed_at='2026-10-24',results=[dict(id=s['id'],status='not_run',message='Not run') for s in raw['scenarios']]))
            old=folder/'old.model.json';old.write_text(json.dumps(data));before=old.read_bytes();out=folder/'migrated.model.json'
            command(isolated/'scripts/migrate_model.py',old,'--output',out,cwd=folder)
            require(old.read_bytes()==before);require(load_json(out)['format_version']=='1.1.0' and 'verification' not in load_json(out))
        check('migration CLI works without viewer files and preserves old source/results',migrate)
        def legacy_conversion():
            raw=load_json(REPO/'dev/tests/example-review.json');raw['renderer_version']='99.0.0';source=folder/'legacy-review.json';source.write_text(json.dumps(raw));out=folder/'legacy.model.json'
            command(isolated/'scripts/build_model.py',source,'--output',out,cwd=folder);data=load_json(out)
            require(data['format_version']=='1.1.0');require('sqlite' not in data['review'] and 'renderer_version' not in data['review']);require(all(not set(s)&{'query','expected','setup_sql'} for s in data['review']['scenarios']))
            report=dict(engine='Regression fixture',scope='Fixture only; not real execution',executed_at='2026-10-24',input_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),results=[dict(id=s['id'],status='not_run') for s in raw['scenarios']]);r=folder/'report.json';r.write_text(json.dumps(report));bound=folder/'legacy-bound.model.json'
            command(isolated/'scripts/build_model.py',source,'--verification',r,'--output',bound)
            validate_model(load_json(bound));require(all(x['method']=='not_run' for x in load_json(bound)['verification']['results']))
            report['input_sha256']='0'*64;r.write_text(json.dumps(report));before=bound.read_bytes();bad=subprocess.run([sys.executable,str(isolated/'scripts/build_model.py'),str(source),'--verification',str(r),'--output',str(bound)],capture_output=True,text=True);require(bad.returncode!=0 and before==bound.read_bytes())
        check('legacy JSON-only projection does not require a renderer pin; stale source reports reject',legacy_conversion)
        def package():
            one,two=folder/'one.zip',folder/'two.zip'
            command(REPO/'dev/tools/package_skill.py','--output',one);command(REPO/'dev/tools/package_skill.py','--output',two)
            require(one.read_bytes()==two.read_bytes(),'Package not reproducible')
            with zipfile.ZipFile(one) as z:
                paths=z.namelist();require('data-modeling/assets/model-viewer.html' in paths);require('data-modeling/assets/NOTICE.txt' in paths)
                require(all(n.startswith('data-modeling/') and not set(Path(n).parts)&{'dev','node_modules','.git','__pycache__','examples'} for n in paths),'Development files leaked into skill')
                for name in paths:require(z.read(name)==(SKILL/Path(name).relative_to('data-modeling')).read_bytes())
                z.extractall(folder/'unpacked')
            unpacked=folder/'unpacked/data-modeling'
            for case,source in cases:
                target=folder/(case['name']+'-unpacked.model.json');command(unpacked/'scripts/validate_model.py',source,cwd=folder);command(unpacked/'scripts/build_model.py',source,'--output',target,cwd=folder);require(load_json(target)==load_json(source))
            require((unpacked/'assets/model-viewer.html').read_bytes()==(SKILL/'assets/model-viewer.html').read_bytes())
        check('one reproducible skill ZIP includes viewer/licenses and runs after isolated extraction',package)
        def viewer_independent():
            project=folder/'viewer only';shutil.copytree(REPO/'dev',project/'dev',ignore=shutil.ignore_patterns('__pycache__','node_modules'))
            shutil.copytree(SKILL/'references/schemas',project/'skills/data-modeling/references/schemas')
            target=folder/'rebuilt.html';command('-S',project/'dev/tools/build_viewer.py','--output',target,cwd=folder)
            require(target.read_bytes()==(SKILL/'assets/model-viewer.html').read_bytes(),'Viewer build needs JSON runtime or is not reproducible')
        check('viewer builds with Python stdlib alone, no JSON Python library or installed model tool',viewer_independent)
        def bad_package():
            spec=importlib.util.spec_from_file_location('package_test',REPO/'dev/tools/package_skill.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            broken=folder/'broken skill';copy_skill(broken);module.SKILL=broken;(broken/'assets/model-viewer.html').unlink()
            try:module.package_bytes()
            except ValueError:pass
            else:raise AssertionError('Package without viewer accepted')
            (broken/'assets/model-viewer.html').write_bytes((SKILL/'assets/model-viewer.html').read_bytes());(broken/'dev').mkdir()
            try:module.package_bytes()
            except ValueError:pass
            else:raise AssertionError('Development files in package accepted')
        check('packaging rejects a missing viewer and unexpected development folders',bad_package)
        def links():
            for md in [SKILL/'SKILL.md',*(SKILL/'references').glob('*.md')]:
                for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)',md.read_text()):
                    if target.startswith(('http:','https:','#','mailto:')):continue
                    name=target.split('#',1)[0].strip('<>');resolved=(md.parent/name).resolve()
                    require(resolved.is_relative_to(SKILL.resolve()) and resolved.exists(),'Broken/self-containment link: '+str(md)+': '+name)
        check('installed skill reference links are self-contained and resolve',links)
        if a.node:
            result=folder/'bundle.json';cp=subprocess.run([a.node,str(REPO/'dev/tests/check_bundle.cjs'),str(SKILL/'assets/model-viewer.html'),str(REPO/'examples/test-manifest.json'),str(result)],capture_output=True,text=True);check('embedded viewer validators and ERD engine accept public cases',lambda:require(cp.returncode==0,cp.stdout+cp.stderr))
    report=dict(passed=sum(c['status']=='pass' for c in checks),failed=sum(c['status']=='fail' for c in checks),checks=checks,browser_visual_inspection='not_run; this suite uses CLI/Node only')
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['passed','failed']}))
    for c in checks:
        if c['status']=='fail':print(c['name']+': '+c['error'])
    if report['failed']:raise SystemExit(1)


if __name__=='__main__':main()
