#!/usr/bin/env python3
"""Regressions for stale results, all-row integrity, atomic reviews and Python/viewer parity. No SQL."""
import argparse,copy,json,hashlib,subprocess,sys,tempfile
from pathlib import Path
from support import ROOT, REPO, load_json, validate_model, build_to_file, review_fingerprint, assess_review, migrate_document


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--manifest',type=Path,default=REPO/'examples/test-manifest.json');p.add_argument('--output',required=True,type=Path);p.add_argument('--node',help='Optional Node executable for browser-validator parity');a=p.parse_args();cases=load_json(a.manifest);checks=[];probes=[]
    def require(value,message='Invariant failed'):
        if not value:raise AssertionError(message)
    def check(name,fn):
        try:fn();checks.append(dict(name=name,status='pass'))
        except Exception as exc:checks.append(dict(name=name,status='fail',error=str(exc)))
    def fixture(name):
        path=Path(next(c['input'] for c in cases if c['name']==name));return load_json(path if path.is_absolute() else REPO/path)
    simple=fixture('inventory');complex_=fixture('booking-change')
    def probe(name,document,expected):
        probes.append(dict(name=name,document=document,expected=expected))
        def run():
            try:validate_model(document,allow_compatibility=True)
            except ValueError:
                require(not expected,'Rejected valid document');return
            require(expected,'Accepted invalid document')
        check(name,run)
    def mutate(name,fn,base=None,expected=False):
        d=copy.deepcopy(base or simple);fn(d);probe(name,d,expected)
    bound=copy.deepcopy(simple);bound['verification']=dict(engine='Regression fixture only',scope='Not a real case result',executed_at='2026-10-24',fingerprint_version='1',input_fingerprint=review_fingerprint(bound['review']),results=[dict(id=s['id'],status='not_run',message='Fixture: not executed',method='not_run',scope='Not executed') for s in bound['review']['scenarios']])
    probe('bound not-run record',bound,True)
    mutate('sample edit invalidates previous result',lambda d:d['review']['entities'][0]['rows'][0].update(name='Changed'),bound)
    mutate('model edit invalidates previous result',lambda d:d['review']['entities'][0].update(description='Changed'),bound)
    mutate('scenario edit invalidates previous result',lambda d:d['review']['scenarios'][0].update(title='Changed'),bound)
    mutate('explicitly removing observations permits re-authoring',lambda d:(d.pop('verification'),d['review']['entities'][0]['rows'][0].update(name='Changed')),bound,True)
    mutate('method and not-run status must match',lambda d:d['verification']['results'][0].update(method='sample'),bound)
    mutate('record must cover exact scenario IDs',lambda d:d['verification']['results'][0].update(id='MISSING'),bound)
    mutate('non-null required value rejects NULL',lambda d:d['review']['entities'][0]['rows'][0].update(id=None))
    mutate('non-null required value cannot be missing',lambda d:d['review']['entities'][0]['rows'][0].pop('id'))
    def duplicate_unused(d):
        e=d['review']['entities'][0];row=copy.deepcopy(e['rows'][0]);row['id']='UNREFERENCED';row['name']='Unreferenced';e['rows'] += [row,copy.deepcopy(row)]
    mutate('duplicate PK in unreferenced rows rejected',duplicate_unused)
    def duplicate_unique(d):
        e=d['review']['entities'][0];row=copy.deepcopy(e['rows'][0]);row['id']='DIFFERENT';e['rows'].append(row)
    mutate('explicit unique tuple rejects repeated business key',duplicate_unique)
    def fk(d,kind='missing'):
        r=d['review']['relationships'][0];e=next(e for e in d['review']['entities'] if e['id']==r['from']['entity']);e['rows'][0][r['from']['columns'][0]]='MISSING' if kind=='missing' else True
    mutate('dangling FK rejected',fk)
    mutate('boolean is not the same FK as a number',lambda d:fk(d,'bool'))
    def composite(d):
        r=d['review'];relation=r['relationships'][0];parent=next(e for e in r['entities'] if e['id']==relation['to']['entity']);child=next(e for e in r['entities'] if e['id']==relation['from']['entity'])
        for e in [parent,child]:
            e['columns'].append(dict(name='scope',label='Scope',type='string',key='',nullable=False,description='Composite test scope'))
            for row in e['rows']:row['scope']='ORG-A'
        relation['from']['columns'].append('scope');relation['to']['columns'].append('scope');parent.setdefault('unique_keys',[]).append(relation['to']['columns'].copy())
    compound=copy.deepcopy(simple);composite(compound);probe('compound FK matches full tuple',compound,True)
    mutate('compound FK rejects same ID with wrong scope',lambda d:next(e for e in d['review']['entities'] if e['id']==d['review']['relationships'][0]['from']['entity'])['rows'][0].update(scope='ORG-B'),compound)
    def nullable_unique(d):
        e=d['review']['entities'][0];e['columns'].append(dict(name='optional_code',label='Optional',type='string',key='UQ',nullable=True,description='Nullable unique test'));e.setdefault('unique_keys',[]).append(['optional_code'])
        for row in e['rows']:row['optional_code']=None
    mutate('nullable unique samples follow documented null semantics',nullable_unique,expected=True)
    def numeric_refs(d):
        e=d['review']['entities'][0];old=e['rows'][0]['id'];e['rows'][0]['id']=1
        for relation in d['review']['relationships']:
            if relation['to']['entity']==e['id'] and relation['to']['columns']==['id']:
                child=next(x for x in d['review']['entities'] if x['id']==relation['from']['entity'])
                for row in child['rows']:
                    if row[relation['from']['columns'][0]]==old:row[relation['from']['columns'][0]]=1.0
        for scenario in d['review']['scenarios']:
            for ref in scenario.get('sample_refs',[]):
                if ref['entity']==e['id'] and ref['key'].get('id')==old:ref['key']['id']=1.0
    numeric=copy.deepcopy(simple);numeric_refs(numeric);probe('numeric PK 1 and 1.0 match across Python and JS',numeric,True)
    def compact(d):
        for e in d['review']['entities']:
            for k in ['example','short_description','review_question','insights']:e.pop(k,None)
    mutate('compact explanations accepted in standard 1.1',compact,expected=True)
    mutate('conditional model needs inclusion condition',lambda d:d['review']['entities'][0].update(role='optional'))
    mutate('unknown uniqueness column rejected',lambda d:d['review']['entities'][0].update(unique_keys=[['MISSING']]))
    def repeat_topic(d):
        rule=copy.deepcopy(d['review']['extensions']['modeling_review']['rules'][0]);rule['id']='BR-SECOND';rule['title']='Another atomic rule';d['review']['extensions']['modeling_review']['rules'].append(rule)
    mutate('multiple atomic rules in same topic accepted',repeat_topic,expected=True)
    mutate('duplicate rule ID rejected',lambda d:d['review']['extensions']['modeling_review']['rules'].append(copy.deepcopy(d['review']['extensions']['modeling_review']['rules'][0])))
    mutate('unknown selected alternative rejected',lambda d:d['review']['decisions'][0].update(selected_choice='MISSING'))
    mutate('placeholder comparison is not two alternatives',lambda d:d['review']['decisions'][0].update(choices=[]))
    def open_rule(d):return next(r for r in d['review']['extensions']['modeling_review']['rules'] if r['decision_status']=='open')
    mutate('open policy needs visible remaining decision',lambda d:open_rule(d).update(review_points=[]),complex_)
    mutate('modeled rule needs a sample scenario',lambda d:d['review']['extensions']['modeling_review']['rules'][0].update(scenarios=[]))
    mutate('review schema cannot be null',lambda d:d['review']['extensions'].update(modeling_review=None))
    def changed(d,after=None,missing_id=False):
        e=d['review']['entities'][0];change=dict(id='CH-TEST',target_type='entity',entity_id=e['id'],change='modified',before={'name':'Previous'},after=after or {'name':e['name']},reason='Fixture change',requirements=[d['review']['requirements'][0]['id']]);
        if missing_id:change.pop('entity_id')
        d['review']['extensions']['modeling_review']['change_impact']['changes']=[change]
    mutate('concrete matching change accepted',changed,expected=True)
    mutate('change after must match actual model',lambda d:changed(d,{'name':'INVENTED'}))
    mutate('change needs target identifier',lambda d:changed(d,missing_id=True))
    def legacy(d):
        d['format_version']='1.0.0';r=d['review'];r['schema_version']='1.0.0';r.pop('extensions',None)
        for e in r['entities']:
            for k in ['role','unique_keys','inclusion_condition']:e.pop(k,None)
            e.update(short_description=e['description'],example='Legacy sample',review_question='Legacy question',insights={'purpose':'Legacy purpose','tradeoff':'Legacy tradeoff','risk':'Legacy risk'})
        for item in r['decisions']:
            item.pop('choices',None);item.pop('selected_choice',None)
        d['verification']={k:v for k,v in bound['verification'].items() if k not in ('fingerprint_version','input_fingerprint')};d['verification']['results']=[{k:v for k,v in x.items() if k not in ('method','scope')} for x in d['verification']['results']]
    old=copy.deepcopy(simple);legacy(old);probe('1.0 historical observations remain readable',old,True)
    check('explicit migration removes unbound active results, preserves source',lambda:(require('verification' not in migrate_document(old)),require(old['format_version']=='1.0.0' and old.get('verification') is not None)))
    for name,value in [('unicode',{'가😀':1.0,'😀':-0.0,'a':[1e-8,True,None,'문자']}),('key-order',{'z':2,'a':1})]:
        d=copy.deepcopy(simple);d['review'].setdefault('extensions',{})['test_values']=value;probe('fingerprint '+name,d,True)
    with tempfile.TemporaryDirectory(prefix='model-integrity-') as tmp:
        folder=Path(tmp)
        for case in cases:
            source=Path(case['input']);source=source if source.is_absolute() else REPO/source
            doc=load_json(source);probe(case['name']+' case validation',doc,True)
            def build(case=case,source=source,doc=doc):
                target=folder/(case['name']+'.model.json');build_to_file(source,target,allow_compatibility=case.get('allow_compatibility',False));raw=target.read_bytes();receipt=target.with_suffix('.build.json').read_bytes();require(load_json(target)==doc)
                build_to_file(source,target,allow_compatibility=case.get('allow_compatibility',False));require(target.read_bytes()==raw and target.with_suffix('.build.json').read_bytes()==receipt)
                out=folder/(case['name']+'-render.model.json');cmd=[sys.executable,str(ROOT/'scripts/build_model.py'),str(source),'--output',str(out)]
                if case.get('allow_compatibility'):cmd+=['--allow-compatibility']
                result=subprocess.run(cmd,capture_output=True,text=True);require(result.returncode==0,result.stderr);require(out.read_bytes()==raw and out.with_suffix('.build.json').read_bytes()==receipt)
            check(case['name']+' deterministic JSON only / API and CLI',build)
        def preserved():
            d=copy.deepcopy(bound);d['review']['title']='Changed';source=folder/'bad.json';source.write_text(json.dumps(d));target=folder/'keep.model.json';target.write_text('KEEP');receipt=target.with_suffix('.build.json');receipt.write_text('KEEP RECEIPT')
            for entry in ['build_model.py']:
                cp=subprocess.run([sys.executable,str(ROOT/'scripts'/entry),str(source),'--output',str(target)],capture_output=True,text=True);require(cp.returncode!=0);require(target.read_text()=='KEEP' and receipt.read_text()=='KEEP RECEIPT')
                clear=folder/(entry+'.json');cp=subprocess.run([sys.executable,str(ROOT/'scripts'/entry),str(source),'--output',str(clear),'--clear-verification'],capture_output=True,text=True);require(cp.returncode==0,cp.stderr);require('verification' not in load_json(clear))
        check('stale build preserves previous files; explicit clear on API and CLI',preserved)
        check('case workflow never creates HTML',lambda:require(not list(folder.rglob('*.html'))))
        if a.node:
            inp=folder/'probes.json';out=folder/'results.json';inp.write_text(json.dumps(probes,ensure_ascii=False));subprocess.run([a.node,str(Path(__file__).parent/'check_integrity.cjs'),str(inp),str(out)],check=True);results=load_json(out)
            for probe_,result in zip(probes,results,strict=True):
                def parity(probe_=probe_,result=result):
                    require(result['accepted']==probe_['expected'],result.get('error','Browser accepted invalid input'))
                    if result['accepted']:require(result['fingerprint']==review_fingerprint(probe_['document']['review']),'Fingerprint mismatch');require(result['exported']==probe_['document'],'Export changed authored document')
                check('browser parity / '+probe_['name'],parity)
    report=dict(passed=sum(c['status']=='pass' for c in checks),failed=sum(c['status']=='fail' for c in checks),checks=checks);a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['passed','failed']}))
    for c in checks:
        if c['status']=='fail':print(c['name']+': '+c['error'])
    if report['failed']:raise SystemExit(1)

if __name__=='__main__':main()
