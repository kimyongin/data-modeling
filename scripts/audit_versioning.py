#!/usr/bin/env python3
"""Check strict schema, explicit compatibility, fixed releases and byte-repeatable builds."""
import argparse
import copy
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from review_contract import ROOT, load_json, renderer_release
from render_review import validate_review


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    example = load_json(ROOT / 'references/example-review.json')
    results = []
    def check(name, action):
        try:
            action(); results.append(dict(name=name, status='pass'))
        except Exception as exc:
            results.append(dict(name=name, status='fail', error=str(exc)))
    def reject(action):
        data = copy.deepcopy(example); action(data)
        try:
            validate_review(data)
        except ValueError:
            return
        raise AssertionError('Invalid/new incomplete input accepted')
    def require(value, message='Assertion failed'):
        if not value: raise AssertionError(message)
    check('standard example accepted', lambda: validate_review(example))
    for field in ['schema_version', 'renderer_version', 'review_profile', 'overview', 'process']:
        check('standard rejects missing ' + field, lambda f=field: reject(lambda d:d.pop(f)))
    check('unknown schema version rejected', lambda: reject(lambda d:d.update(schema_version='99.0.0')))
    check('different renderer pin rejected', lambda: reject(lambda d:d.update(renderer_version='99.0.0')))
    check('unknown root field rejected', lambda: reject(lambda d:d.update(custom_css='body{}')))
    check('unknown column field rejected', lambda: reject(lambda d:d['entities'][0]['columns'][0].update(lable='typo')))
    check('missing entity explanation rejected', lambda: reject(lambda d:d['entities'][0].pop('insights')))
    check('missing business column label rejected', lambda: reject(lambda d:d['entities'][0]['columns'][0].pop('label')))
    check('wrong nullable type rejected', lambda: reject(lambda d:d['entities'][0]['columns'][0].update(nullable='false')))
    check('missing relationship reason rejected', lambda: reject(lambda d:d['relationships'][0].pop('rationale')))
    check('missing scenario explanation rejected', lambda: reject(lambda d:d['scenarios'][0].pop('explanation')))
    check('unknown relationship endpoint rejected', lambda: reject(lambda d:d['relationships'][0]['to'].update(entity='unknown')))
    check('compatibility cannot be used implicitly', lambda: reject(lambda d:d.update(review_profile='compatibility')))
    legacy = copy.deepcopy(example); legacy['review_profile']='compatibility';legacy.pop('overview');legacy['entities'][0].pop('insights')
    check('explicit compatibility preserves absent authored sections', lambda: validate_review(legacy, allow_compatibility=True))
    with tempfile.TemporaryDirectory(prefix='model-versioning-') as temp:
        folder = Path(temp)
        def write(name, data):
            target=folder/name;target.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');return target
        def run(script, *arguments, root=ROOT):
            return subprocess.run([sys.executable,str(root/'scripts'/script),*map(str,arguments)],capture_output=True,text=True)
        legacy_path=write('compatibility.json',legacy)
        def render_compatibility():
            out=folder/'compatibility.model.json'
            no=run('render_review.py',legacy_path,'--output',out);require(no.returncode!=0 and not out.exists())
            yes=run('render_review.py',legacy_path,'--output',out,'--allow-compatibility');require(yes.returncode==0,yes.stderr)
            payload=load_json(out)
            require(payload['build_metadata']['review_profile']=='compatibility' and 'overview' not in payload['review'])
        check('CLI requires compatibility flag and records its profile',render_compatibility)
        for name, raw in [('duplicate','{"schema_version":"1.0.0","schema_version":"99.0.0"}'),('nan','{"amount":NaN}')]:
            def invalid_json(name=name,raw=raw):
                path=folder/(name+'.json');path.write_text(raw)
                try:load_json(path)
                except ValueError:return
                raise AssertionError('Invalid JSON accepted')
            check('JSON rejects '+name,invalid_json)
        def no_overwrite():
            data=copy.deepcopy(example);data.pop('overview');path=write('invalid.json',data);out=folder/'keep.model.json';out.write_text('KEEP_EXISTING_RESULT')
            proc=run('render_review.py',path,'--output',out);require(proc.returncode!=0);require(out.read_text()=='KEEP_EXISTING_RESULT');require(not out.with_suffix('.build.json').exists())
        check('invalid input leaves existing output untouched',no_overwrite)
        def no_standard_bypass():
            data=copy.deepcopy(example);data.pop('overview');path=write('standard-incomplete.json',data);out=folder/'no-bypass.model.json'
            proc=run('render_review.py',path,'--output',out,'--allow-compatibility');require(proc.returncode!=0 and not out.exists())
        check('compatibility flag alone never weakens standard validation',no_standard_bypass)
        old=copy.deepcopy(example)
        for key in ['schema_version','renderer_version','review_profile']:old.pop(key)
        old_path=write('unversioned.json',old)
        def explicit_migration():
            out=folder/'migrated.json';proc=run('migrate_review.py',old_path,'--output',out);require(proc.returncode==0,proc.stderr)
            value=load_json(out)
            for key in ['schema_version','renderer_version','review_profile']:value.pop(key)
            require(value==old,'Migration changed business data')
            require(run('migrate_review.py',old_path,'--output',out).returncode!=0,'Migration overwrote a file')
        check('explicit migration preserves business data and original/output files',explicit_migration)
        def incomplete_migration():
            data=copy.deepcopy(old);data.pop('overview');path=write('old-incomplete.json',data);out=folder/'incomplete.json'
            require(run('migrate_review.py',path,'--output',out).returncode!=0 and not out.exists())
            proc=run('migrate_review.py',path,'--output',out,'--profile','compatibility');require(proc.returncode==0,proc.stderr);require('overview' not in load_json(out))
        check('migration never invents missing business content',incomplete_migration)
        def unversioned_render():
            out=folder/'unversioned.html';require(run('render_review.py',old_path,'--format','html','--output',out).returncode!=0 and not out.exists())
        check('unversioned input is never silently upgraded',unversioned_render)
        copy_root=folder/'renderer';shutil.copytree(ROOT,copy_root,ignore=shutil.ignore_patterns('__pycache__','.DS_Store'))
        def tamper():
            css=copy_root/'assets/review.css';css.write_text(css.read_text()+'\n/* changed without release */')
            out=folder/'tampered.html';path=write('valid.json',example);proc=run('render_review.py',path,'--format','html','--output',out,root=copy_root)
            require(proc.returncode!=0 and not out.exists() and 'integrity' in proc.stderr,proc.stderr)
        check('runtime change without new release blocks generation',tamper)
        def same_release():
            proc=run('release_renderer.py','--version',example['renderer_version'],'--notes','cannot overwrite',root=copy_root);require(proc.returncode!=0,'Released version overwritten')
        check('same renderer version cannot be resealed',same_release)
        def new_release():
            history=copy_root/'releases'/(example['renderer_version']+'.json');prior=history.read_bytes();parts=list(map(int,example['renderer_version'].split('.')));parts[-1]+=1;next_version='.'.join(map(str,parts))
            proc=run('release_renderer.py','--version',next_version,'--notes','isolated maintenance test',root=copy_root);require(proc.returncode==0,proc.stderr)
            require(history.read_bytes()==prior)
            path=write('pinned-old.json',example);out=folder/'new-release.html';require(run('render_review.py',path,'--format','html','--output',out,root=copy_root).returncode!=0)
            data=copy.deepcopy(example);data['renderer_version']=next_version;path=write('pinned-new.json',data)
            proc=run('render_review.py',path,'--format','html','--output',out,root=copy_root);require(proc.returncode==0,proc.stderr)
        check('new release keeps history and requires explicit repinning',new_release)
        manifest=load_json(args.manifest) if args.manifest else [dict(name='example',input=str(ROOT/'references/example-review.json'),verification=None)]
        locked=(ROOT/'renderer-release.json').read_bytes()
        for entry in manifest:
            def repeat(entry=entry):
                outputs=[];flag=['--allow-compatibility'] if entry.get('allow_compatibility') else []
                for n in range(2):
                    out=folder/(entry['name']+'-'+str(n)+'.model.json');cmd=[entry['input'],'--output',out,*flag]
                    if entry.get('verification'):cmd+=['--verification',entry['verification']]
                    proc=run('build_model.py',*cmd);require(proc.returncode==0,proc.stderr);outputs.append(out.read_bytes())
                    receipt=load_json(out.with_suffix('.build.json'))
                    require(receipt['input_sha256']==hashlib.sha256(Path(entry['input']).read_bytes()).hexdigest())
                    require(receipt['output_sha256']==hashlib.sha256(out.read_bytes()).hexdigest())
                    require(receipt['renderer_release_sha256']==hashlib.sha256(locked).hexdigest())
                require(outputs[0]==outputs[1],'Same data and release produced different bytes')
            check(entry['name']+' two data-only builds and receipt hashes match',repeat)
        check('case builds never modify the fixed renderer',lambda: require(locked==(ROOT/'renderer-release.json').read_bytes() and renderer_release()['renderer_version']==example['renderer_version']))
    payload=dict(passed=sum(r['status']=='pass' for r in results),failed=sum(r['status']=='fail' for r in results),checks=results)
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:payload[k] for k in ['passed','failed']}))
    for item in results:
        if item['status']=='fail':print(item['name']+': '+item['error'])
    return bool(payload['failed'])


if __name__=='__main__':
    raise SystemExit(main())
