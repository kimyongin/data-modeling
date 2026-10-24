#!/usr/bin/env python3
"""Exercise the primary hand-authored document and JSON-only builder without producing case HTML."""
import argparse,copy,hashlib,json,subprocess,sys,tempfile
from pathlib import Path
from review_contract import ROOT,load_json
from build_model import validate_model


def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--manifest',type=Path);p.add_argument('--output',type=Path,required=True);args=p.parse_args();checks=[];example=load_json(ROOT/'references/example-model.json')
 def require(v):
  if not v:raise AssertionError('Model JSON contract failed')
 def check(name,fn):
  try:fn();checks.append(dict(name=name,status='pass'))
  except Exception as e:checks.append(dict(name=name,status='fail',error=str(e)))
 def reject(edit):
  data=copy.deepcopy(example);edit(data)
  try:validate_model(data)
  except (ValueError,KeyError,TypeError):return
  raise AssertionError('Invalid primary model accepted')
 check('hand-authored standard document accepted',lambda:validate_model(example))
 check('no renderer pin, checksum, SQL or execution results required',lambda:require('renderer_version' not in example['review'] and 'checksum' not in example and 'verification' not in example and all('expected' not in s for s in example['review']['scenarios'])))
 for name,edit in [('unknown format',lambda d:d.update(format='other')),('unsupported model format',lambda d:d.update(format_version='99.0.0')),('unsupported schema',lambda d:d['review'].update(schema_version='99.0.0')),('missing required model description',lambda d:d['review']['entities'][0].pop('description')),('unknown field',lambda d:d.update(javascript='alert(1)')),('bad relation',lambda d:d['review']['relationships'][0]['to'].update(entity='MISSING')),('duplicate ID',lambda d:d['review']['entities'][1].update(id=d['review']['entities'][0]['id'])),('unsafe integer',lambda d:d['review']['entities'][0]['rows'][0].update(id=9007199254740993))]:check('reject '+name,lambda edit=edit:reject(edit))
 with tempfile.TemporaryDirectory(prefix='model-json-only-') as tmp:
  folder=Path(tmp);source=folder/'source.json';source.write_text(json.dumps(example,ensure_ascii=False)+'\n')
  def run(script,*values):return subprocess.run([sys.executable,str(ROOT/'scripts'/script),*map(str,values)],capture_output=True,text=True)
  def direct():
   target=folder/'direct.model.json';r=run('build_model.py',source,'--output',target);require(r.returncode==0);require(load_json(target)==example);require(not list(folder.glob('*.html')));require(load_json(target.with_suffix('.build.json'))['kind']=='model-json')
  check('default builder preserves directly authored model and creates no HTML',direct)
  check('same validator accepts the primary JSON directly',lambda:require(run('validate_review.py',source).returncode==0))
  def common_direct():
   target=folder/'common-direct.model.json';r=run('render_review.py',source,'--output',target);require(r.returncode==0);require(target.read_bytes()==(folder/'direct.model.json').read_bytes());require(target.with_suffix('.build.json').read_bytes()==(folder/'direct.model.build.json').read_bytes())
  check('both default entry points accept authored JSON and produce identical JSON and receipts',common_direct)
  def common_implicit_html():
   target=folder/'implicit.html';target.write_text('existing HTML');r=run('render_review.py',source,'--output',target);require(r.returncode!=0 and target.read_text()=='existing HTML' and 'explicit --format html' in r.stderr);require(not target.with_suffix('.build.json').exists());target.unlink()
  check('an HTML filename alone never activates the HTML generator',common_implicit_html)
  def explicit_html():
   target=folder/'maintenance'/'explicit.html';r=run('render_review.py',ROOT/'references/example-review.json','--format','html','--output',target);require(r.returncode==0 and target.read_text().startswith('<!doctype html>'))
  check('explicit maintenance HTML mode remains available',explicit_html)
  for script in ['build_model.py','render_review.py']:
   def collision(script=script):
    original=folder/'guard.model.build.json';original.write_text(json.dumps(example));before=original.read_bytes();target=folder/'guard.model.json';r=run(script,original,'--output',target);require(r.returncode!=0 and original.read_bytes()==before and not target.exists())
   check(script+' never overwrites authored input with its receipt',collision)

  def html_rejected():
   target=folder/'existing.html';target.write_text('untouched');r=run('build_model.py',source,'--output',target);require(r.returncode!=0 and target.read_text()=='untouched')
  check('default builder refuses HTML output',html_rejected)
  for name,raw in [('duplicate','{"format":"one","format":"two"}'),('nonfinite','{"x":NaN}'),('not-object','[]')]:
   def broken(raw=raw):
    inp=folder/'broken.json';inp.write_text(raw);target=folder/'preserved.model.json';target.write_text('untouched');r=run('build_model.py',inp,'--output',target);require(r.returncode!=0 and target.read_text()=='untouched')
   check('bad '+name+' input preserves previous output',broken)
  manifest=load_json(args.manifest) if args.manifest else []
  for case in manifest:
   def repeated(case=case):
    outputs=[]
    for n in range(2):
     target=folder/(case['name']+str(n)+'.model.json');cmd=[case['input'],'--output',target]
     if case.get('verification'):cmd+=['--verification',case['verification']]
     if case.get('allow_compatibility'):cmd+=['--allow-compatibility']
     r=run('build_model.py',*cmd);require(r.returncode==0);outputs.append(target.read_bytes());doc=load_json(target);validate_model(doc,case.get('allow_compatibility',False));require('sqlite' not in doc['review']);require('renderer_version' not in doc['review']);require(all(not set(s)&{'query','setup_sql','expected','result_columns','expect_error'} for s in doc['review']['scenarios']));require(load_json(target.with_suffix('.build.json'))['output_sha256']==hashlib.sha256(target.read_bytes()).hexdigest())
     if case.get('verification'):require([x['status'] for x in doc['verification']['results']]==[x['status'] for x in load_json(case['verification'])['results']])
    require(outputs[0]==outputs[1]);require(not list(folder.glob(case['name']+'*.html')))
    target=folder/(case['name']+'-common.model.json');cmd=[case['input'],'--output',target]
    if case.get('verification'):cmd+=['--verification',case['verification']]
    if case.get('allow_compatibility'):cmd+=['--allow-compatibility']
    result=run('render_review.py',*cmd);require(result.returncode==0);require(target.read_bytes()==outputs[0])
   check(case['name']+' repeatable JSON-only projection, receipts and truthful states',repeated)
   if case.get('verification'):
    def stale(case=case):
     r=load_json(case['verification']);r['input_sha256']='0'*64;bad=folder/'stale.json';bad.write_text(json.dumps(r));out=folder/'stale-output.model.json';out.write_text('untouched');cmd=[case['input'],'--verification',bad,'--output',out]
     if case.get('allow_compatibility'):cmd+=['--allow-compatibility']
     result=run('build_model.py',*cmd);require(result.returncode!=0 and out.read_text()=='untouched')
    check(case['name']+' stale execution report rejected',stale)
  check('default build directory contains no newly generated HTML',lambda:require(list(folder.glob('*.html'))==[folder/'existing.html']))
 report=dict(passed=sum(x['status']=='pass' for x in checks),failed=sum(x['status']=='fail' for x in checks),checks=checks);args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:report[k] for k in ('passed','failed')}))
 for x in checks:
  if x['status']=='fail':print(x['name']+': '+x['error'])
 if report['failed']:raise SystemExit(1)


if __name__=='__main__':main()
