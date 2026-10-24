#!/usr/bin/env python3
"""Run input, execution-integrity and packaging regressions with pinned schema validation dependencies."""
import argparse
import copy
import json
import tempfile
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
from render_review import validate_review, render
from verify_sqlite import verify


def run(example):
    checks=[]
    def check(name, action):
        try:
            action()
            checks.append(dict(name=name,status='pass'))
        except Exception as exc:
            checks.append(dict(name=name,status='fail',error=str(exc)))
    def reject(data):
        try: validate_review(data)
        except (ValueError, KeyError, TypeError): return
        raise AssertionError('Invalid input was accepted')
    def changed(action):
        data=copy.deepcopy(example);action(data);return data
    def status(case, expected):
        data=copy.deepcopy(example);data['scenarios']=[case]
        actual=verify(data)[0]
        assert actual['status']==expected,actual

    def business_payload():
        import re
        results=verify(example)
        report=dict(engine='SQLite',scope='synthetic',executed_at='test',results=results)
        document=render(example,report)
        payload=json.loads(re.search(r'<script type="application/json" id="review-data">(.*?)</script>',document,re.S).group(1))
        assert 'sqlite' not in payload['review']
        for case in payload['review']['scenarios']:
            assert not set(case) & {'query','setup_sql','expected','expect_error','expect_error_message','result_columns','result_key'}
        assert [r['status'] for r in payload['verification']['results']]==[r['status'] for r in results]
        assert all(set(r)=={'id','status','message'} for r in payload['verification']['results'])
        assert all('query' in case or 'expected' in case for case in example['scenarios']), 'original execution input mutated'
    check('business HTML contains text checks without executable or raw result material', business_payload)
    check('spec design narrative requires text',lambda: reject(changed(lambda d:d['requirements'][0].update(design=[]))))
    check('concise review point summary requires text',lambda: reject(changed(lambda d:d['review_points'][0].update(summary=''))))
    check('sample evidence requires a complete primary key',lambda: reject(changed(lambda d:d['scenarios'][0]['sample_refs'][0].update(key={}))))
    check('sample evidence must match a baseline row',lambda: reject(changed(lambda d:d['scenarios'][0]['sample_refs'][0].update(key={'id':'missing'}))))
    check('sample evidence model must be part of its scenario',lambda: reject(changed(lambda d:d['scenarios'][0]['sample_refs'][0].update(entity='organization'))))
    check('observed business outcome requires text',lambda: reject(changed(lambda d:d['scenarios'][0].update(observation=[]))))
    def suppress_unconfirmed_observation():
        case=copy.deepcopy(example);case['scenarios'][0]['observation']='OBSERVATION_ONLY_AFTER_PASS'
        results=verify(case)
        for status in ('fail','not_run'):
            altered=copy.deepcopy(results);altered[0]['status']=status
            output=render(case,dict(engine='SQLite',scope='test',executed_at='test',results=altered))
            assert 'OBSERVATION_ONLY_AFTER_PASS' not in output
        assert 'OBSERVATION_ONLY_AFTER_PASS' in render(case,dict(engine='SQLite',scope='test',executed_at='test',results=results))
    check('authored observation appears only after a passing execution', suppress_unconfirmed_observation)
    check('overview requires a nonempty problem',lambda: reject(changed(lambda d:d['overview'].update(goal=''))))
    check('overview structure requires explained groups',lambda: reject(changed(lambda d:d['overview'].update(structure=[dict(title='group')]))))
    check('overview requires a complete business example',lambda: reject(changed(lambda d:d['overview'].update(example=dict(situation='example')))))
    check('overview diagram rejects missing endpoints',lambda: reject(changed(lambda d:d['overview']['diagram']['links'][0].update(to='unknown'))))
    check('overview diagram rejects duplicate nodes',lambda: reject(changed(lambda d:d['overview']['diagram']['nodes'].append(copy.deepcopy(d['overview']['diagram']['nodes'][0])))))
    check('overview links require an explained meaning',lambda: reject(changed(lambda d:d['overview']['diagram']['links'][0].update(label=''))))
    def legacy_overview():
        data=copy.deepcopy(example);data.pop('overview');data['review_profile']='compatibility'
        validate_review(data,allow_compatibility=True)
    check('explicit compatibility review without overview stays valid',legacy_overview)
    check('spec bullet rules must be nonempty strings',lambda: reject(changed(lambda d:d['requirements'][0].update(design_points=['']))))
    check('relationship business rationale must be nonempty text',lambda: reject(changed(lambda d:d['relationships'][0].update(rationale=[]))))
    check('baseline constraints and queries',lambda: assert_all_pass(verify(example)))
    check('duplicate identifiers rejected',lambda: reject(changed(lambda d:d['entities'][1].update(id=d['entities'][0]['id']))))
    check('invalid domain references rejected',lambda: reject(changed(lambda d:d['domains'][0]['entities'].append('missing_entity'))))
    check('invalid insight references rejected',lambda: reject(changed(lambda d:d['entities'][0]['insights']['source_ids'].append('missing_source'))))
    check('non-object items rejected',lambda: reject(changed(lambda d:d['entities'].append('wrong'))))
    check('physical FK column mismatch rejected',lambda: reject(changed(lambda d:d['relationships'][0].update(foreign_key=True,to=dict(entity='organization',columns=[],cardinality='1')))))
    check('foreign_key type validated',lambda: reject(changed(lambda d:d['relationships'][0].update(foreign_key='false'))))
    check('actual process requires nonempty steps',lambda: reject(changed(lambda d:d.update(process=dict(skill='data-modeling',steps=[])))))
    check('business column labels require text',lambda: reject(changed(lambda d:d['entities'][0]['columns'][0].update(label=[]))))
    check('business examples require text',lambda: reject(changed(lambda d:d['entities'][0].update(example={'unwritten':True}))))
    check('scenario explanation must include business reason',lambda: reject(changed(lambda d:d['scenarios'][0].update(explanation=dict(situation='example',expected_behavior='expected')))))
    check('readable result headers must match expected rows',lambda: reject(changed(lambda d:d['scenarios'][0].update(result_columns=['wrong-width']))))
    check('unknown initial entity rejected',lambda: reject(changed(lambda d:d.update(initial_entity='missing'))))
    check('invalid sample label columns rejected',lambda: reject(changed(lambda d:d['entities'][0].update(sample_label_columns=['missing']))))
    check('review point kind validated',lambda: reject(changed(lambda d:d['review_points'][0].update(kind='approved'))))
    check('review point recommendation required',lambda: reject(changed(lambda d:d['review_points'][0].update(recommendation=''))))
    check('review point references validated',lambda: reject(changed(lambda d:d['review_points'][0].update(entities=['missing']))))
    check('comparison identifiers must use valid column positions',lambda: reject(changed(lambda d:d['scenarios'][0].update(result_key=[9]))))
    check('rejection prose requires exact error evidence',lambda: reject(changed(lambda d:d['scenarios'][0].update(rejection_reason='blocked'))))
    check('matching constraint code with wrong cause fails',lambda: status(dict(id='N-9',query="INSERT INTO organization VALUES('O1','duplicate')",expect_error='SQLITE_CONSTRAINT_UNIQUE',expect_error_message='different cause'),'fail'))
    check('wrong expected rows fail',lambda: status(dict(id='N-1',query='SELECT 1',expected=[[2]]),'fail'))
    check('syntax error cannot satisfy constraint expectation',lambda: status(dict(id='N-2',query='SELEC 1',expect_error='SQLITE_CONSTRAINT_UNIQUE'),'fail'))
    check('setup error cannot satisfy scenario expectation',lambda: status(dict(id='N-3',setup_sql='INSERT INTO organization VALUES (\'O1\',\'duplicate\');',query='SELECT 1',expect_error='SQLITE_CONSTRAINT_UNIQUE'),'fail'))
    check('unexecuted query remains not_run',lambda: status(dict(id='N-4',expected=[[1]]),'not_run'))
    check('external database attachment rejected',lambda: status(dict(id='N-5',query="ATTACH DATABASE ':memory:' AS outside",expected=[]),'fail'))
    check('pragma disabling constraints rejected',lambda: status(dict(id='N-6',query='PRAGMA foreign_keys=OFF',expected=[]),'fail'))
    check('duplicate expected rows preserved in unordered comparison',lambda: status(dict(id='N-7',query='SELECT 1',expected=[[1],[1]],unordered=True),'fail'))
    check('wrong constraint category cannot pass',lambda: status(dict(id='N-8',query="INSERT INTO organization VALUES('O1','duplicate')",expect_error='SQLITE_CONSTRAINT_FOREIGNKEY'),'fail'))
    check('ambiguous expected rows and error rejected',lambda: reject(changed(lambda d:d['scenarios'][0].update(expect_error='SQLITE_CONSTRAINT_UNIQUE'))))

    with tempfile.TemporaryDirectory(prefix='data-modeling-audit-') as tmp:
        folder=Path(tmp);input_path=folder/'review.json';input_path.write_text(json.dumps(example,ensure_ascii=False),encoding='utf-8')
        renderer=Path(__file__).with_name('render_review.py')
        def reject_report(report):
            path=folder/'report.json';path.write_text(json.dumps(report),encoding='utf-8')
            result=subprocess.run([sys.executable,str(renderer),str(input_path),'--format','html','--verification',str(path),'--output',str(folder/'rejected.html')],capture_output=True,text=True)
            assert result.returncode!=0,'Invalid report was rendered'
        check('empty verification object rejected',lambda: reject_report({}))
        check('verification array rejected',lambda: reject_report([]))
        check('stale verification rejected',lambda: reject_report(dict(engine='SQLite',scope='test',executed_at='2026-10-24',input_sha256='wrong',results=[])))
    return checks


def assert_all_pass(results):
    assert results and all(r['status']=='pass' for r in results),results


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('example',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    results=run(json.loads(args.example.read_text(encoding='utf-8')))
    payload=dict(checks=results,passed=sum(c['status']=='pass' for c in results),failed=sum(c['status']=='fail' for c in results))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in payload.items() if k!='checks'}))
    return bool(payload['failed'])


if __name__=='__main__':
    raise SystemExit(main())
