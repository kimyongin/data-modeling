#!/usr/bin/env python3
"""Check design-review semantics, truthful statuses and JSON-only cross-domain builds."""
import argparse,copy,hashlib,json,subprocess,sys,tempfile
from pathlib import Path
from review_contract import ROOT,load_json
from build_model import validate_model,build_to_file
from modeling_review import assess_review


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--manifest',required=True,type=Path);p.add_argument('--output',required=True,type=Path);a=p.parse_args();cases=load_json(a.manifest);checks=[]
    def require(value):
        if not value:raise AssertionError('Design review invariant failed')
    def check(name,action):
        try:action();checks.append(dict(name=name,status='pass'))
        except Exception as exc:checks.append(dict(name=name,status='fail',error=str(exc)))
    simple=load_json(cases[0]['input']);complex_=load_json(cases[1]['input'])
    def reject(edit,document=complex_):
        d=copy.deepcopy(document);edit(d['review'])
        try:validate_model(d)
        except ValueError:return
        raise AssertionError('Invalid design review accepted')
    for name,edit in [
        ('null review is not a missing legacy record',lambda r:r['extensions'].update(modeling_review=None)),
        ('unsupported review version',lambda r:r['extensions']['modeling_review'].update(version='2.0.0')),
        ('open rule without visible issue',lambda r:next(x for x in r['extensions']['modeling_review']['rules'] if x['decision_status']=='open').update(review_points=[])),
        ('policy disguised as execution issue',lambda r:next(x for x in r['extensions']['modeling_review']['rules'] if x['decision_status']=='open').update(review_points=['Q-07'])),
        ('addressed rule without a sample',lambda r:r['extensions']['modeling_review']['rules'][0].update(scenarios=[])),
        ('comparison hidden outside display fields',lambda r:r['decisions'][0].pop('choices')),
        ('impact explanation cannot be found',lambda r:r['extensions']['modeling_review']['change_impact']['items'][0].update(note_ref='MISSING')),
        ('unknown baseline cannot establish no impact',lambda r:r['extensions']['modeling_review']['change_impact']['items'][0].update(status='unaffected')),
        ('unknown impact without an issue',lambda r:r['extensions']['modeling_review']['change_impact']['items'][0].update(review_points=[])),
        ('affected impact without model targets',lambda r:r['extensions']['modeling_review']['change_impact']['items'][0].update(status='affected',entities=[])),
        ('duplicate rule identifiers',lambda r:r['extensions']['modeling_review']['rules'].append(copy.deepcopy(r['extensions']['modeling_review']['rules'][0]))),
        ('duplicate note identifiers',lambda r:r['assumptions'].append(dict(id='A-BASE',title='Duplicate'))),
    ]:check('reject '+name,lambda edit=edit:reject(edit))
    def warning(edit,code):
        d=copy.deepcopy(complex_);edit(d['review']);validate_model(d);require(code in [w['code'] for w in assess_review(d['review'])['warnings']])
    check('complex case flags unreviewed rule areas',lambda:warning(lambda r:r['extensions']['modeling_review'].update(rules=[x for x in r['extensions']['modeling_review']['rules'] if x['topic']!='identity']),'rule_topic_unreviewed'))
    check('existing change flags omitted impact areas',lambda:warning(lambda r:r['extensions']['modeling_review']['change_impact']['items'].pop(),'impact_area_unreviewed'))
    check('two authored versions of the design are flagged',lambda:warning(lambda r:r['requirements'][0].update(design='重複' if False else '설계의 두 번째 원문'),'duplicate_design_forms'))
    sentence='공통 판단은 한 원본에 관리하고 각 엔터티에는 자신만의 의미와 대가를 적어야 합니다. 이 문장은 반복 경고를 확인하기 위한 충분히 긴 합성 문장입니다.'
    check('repeated entity prose is flagged',lambda:warning(lambda r:[e['insights'].update(risk=sentence) for e in r['entities'][:2]],'repeated_explanation'))
    legacy=copy.deepcopy(simple);legacy['review'].pop('extensions')
    check('old documents remain valid and disclose missing review',lambda:(validate_model(legacy),require(assess_review(legacy['review'])['warnings'][0]['code']=='review_not_recorded')))
    check('simple case does not require irrelevant impact and all rule categories',lambda:(validate_model(simple),require(not assess_review(simple['review'])['warnings'])))
    with tempfile.TemporaryDirectory(prefix='model-review-json-only-') as tmp:
        folder=Path(tmp)
        for case in cases:
            def build(case=case):
                source=Path(case['input']);data=load_json(source);target=folder/(case['name']+'.model.json')
                build_to_file(source,target,allow_compatibility=case.get('allow_compatibility',False));raw=target.read_bytes();receipt=target.with_suffix('.build.json').read_bytes();require(load_json(target)==data)
                build_to_file(source,target,allow_compatibility=case.get('allow_compatibility',False));require(raw==target.read_bytes() and receipt==target.with_suffix('.build.json').read_bytes())
                alternate=folder/(case['name']+'-common.model.json');cmd=[sys.executable,str(ROOT/'scripts/render_review.py'),str(source),'--output',str(alternate)]
                if case.get('allow_compatibility'):cmd+=['--allow-compatibility']
                result=subprocess.run(cmd,capture_output=True,text=True);require(result.returncode==0);require(alternate.read_bytes()==raw and alternate.with_suffix('.build.json').read_bytes()==receipt)
                require(load_json(target.with_suffix('.build.json'))['output_sha256']==hashlib.sha256(raw).hexdigest())
                if case['name'] in ('inventory','booking-change'):require(data.get('verification') is None)
            check(case['name']+' repeatable JSON / both entrypoints / preserves all statuses',build)
        def preserve():
            bad=copy.deepcopy(complex_);bad['review']['extensions']['modeling_review']['rules'][0]['scenarios']=[];source=folder/'invalid.json';source.write_text(json.dumps(bad));out=folder/'keep.model.json';out.write_text('KEEP')
            try:build_to_file(source,out)
            except ValueError:pass
            else:raise AssertionError('Invalid input accepted')
            require(out.read_text()=='KEEP' and not out.with_suffix('.build.json').exists())
        check('invalid review preserves existing output and receipt',preserve)
        check('cross-domain cases produce no HTML',lambda:require(not list(folder.rglob('*.html'))))
    report=dict(passed=sum(c['status']=='pass' for c in checks),failed=sum(c['status']=='fail' for c in checks),checks=checks)
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:report[k] for k in ('passed','failed')}))
    for c in checks:
        if c['status']=='fail':print(c['name']+': '+c['error'])
    if report['failed']:raise SystemExit(1)

if __name__=='__main__':main()
