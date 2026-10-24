"""Shared behavioral fixtures. Browser and Python must agree on results and codes."""
import copy
from pathlib import Path
import sys
REPO=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(REPO/'skills/data-modeling/scripts'))
from lib.contract import load_json
from lib.fingerprint import observation_fingerprint


def cases():
    simple=load_json(REPO/'examples/inventory.model.json')
    complex_case=load_json(REPO/'examples/openmarket.model.json')
    simple['observations']=[]
    complex_case['observations']=[]
    output=[]
    def add(name,document,code=None):
        output.append(dict(name=name,document=document,code=code))
    def mutate(name,action,code,base=None):
        d=copy.deepcopy(base or simple);action(d);add(name,d,code)
    for name in ['inventory','booking-change','openmarket']:
        add(name+' example',load_json(REPO/'examples'/f'{name}.model.json'))
    mutate('previous document format rejected',lambda d:d.update(version='1.1.0'),'version')
    mutate('unknown fields rejected',lambda d:d.update(review={}), 'schema')
    mutate('empty purpose rejected',lambda d:d['document'].update(goal=' '),'schema')
    mutate('global IDs cannot collide',lambda d:d['requirements'][0].update(id=d['model']['entities'][0]['id']),'duplicate_id')
    mutate('unknown requirement reference',lambda d:d['model']['entities'][0]['requirement_ids'].append('R-MISSING'),'reference')
    mutate('attribute name duplicate',lambda d:d['model']['entities'][0]['attributes'].append(copy.deepcopy(d['model']['entities'][0]['attributes'][0])),'attribute_duplicate')
    mutate('primary key must name an attribute',lambda d:d['model']['entities'][0].update(primary_key=['missing']),'key_attribute')
    mutate('display labels can combine existing attributes',lambda d:d['model']['entities'][0].update(display_attributes=['name']),None)
    mutate('display label attributes must exist',lambda d:d['model']['entities'][0].update(display_attributes=['missing']),'display_attribute')
    mutate('display label attributes cannot repeat',lambda d:d['model']['entities'][0].update(display_attributes=['name','name']),'schema')
    mutate('duplicate unique tuples rejected',lambda d:d['model']['entities'][0]['unique_keys'].append(d['model']['entities'][0]['unique_keys'][0].copy()),'unique_duplicate')
    mutate('FK target must declare uniqueness',lambda d:(d['model']['relationships'][0]['to'].update(attributes=['name']),d['model']['entities'][0].update(unique_keys=[])),'foreign_key_unique')
    def duplicate(d):
        rows=d['samples']['datasets'][0]['rows']['item'];rows.append(copy.deepcopy(rows[0]))
    mutate('all rows, including unreferenced rows, have unique PKs',duplicate,'sample_duplicate')
    mutate('required sample cannot be null',lambda d:d['samples']['datasets'][0]['rows']['item'][0].update(id=None),'sample_required')
    mutate('unknown sample attribute rejected',lambda d:d['samples']['datasets'][0]['rows']['item'][0].update(unknown='x'),'sample_attribute')
    mutate('dangling sample FK rejected',lambda d:d['samples']['datasets'][0]['rows']['item'][0].update(category_id='missing'),'sample_foreign_key')
    mutate('scenario points to full PK',lambda d:d['samples']['scenarios'][0]['sample_refs'][0].update(key={'name':'x'}),'sample_reference_key')
    mutate('scenario baseline row must exist',lambda d:d['samples']['scenarios'][0]['sample_refs'][0].update(key={'id':'missing'}),'sample_reference_row')
    mutate('dataset selection explicit',lambda d:d['samples']['scenarios'][0].update(dataset_id='DS-MISSING'),'scenario_dataset')
    mutate('modeled rule has a scenario',lambda d:d['rules'][0].update(scenario_ids=[]),'rule_coverage')
    mutate('chosen alternative must exist',lambda d:d['decisions'][0].update(selected_choice='MISSING'),'decision_choice')
    mutate('conditional entity declares condition',lambda d:d['model']['entities'][0].update(role='optional'),'schema')
    mutate('concrete change after matches current model',lambda d:d['change_impact']['changes'][0].update(after={'name':'invented'}),'change_after',complex_case)
    mutate('overview links known nodes',lambda d:d['document']['overview']['diagram']['links'][0].update(to='MISSING'),'overview_link')
    def bound(d):
        sid=d['samples']['scenarios'][0]['id']
        d['observations']=[dict(scenario_id=sid,status='pass',method='sample',scope='Regression fixture only',observed_at='2026-10-24',message='Fixture result, not a case implementation result',input_fingerprint=observation_fingerprint(d,sid,'sample'))]
    observation=copy.deepcopy(simple);bound(observation);add('scoped result accepted',observation)
    mutate('overview wording does not invalidate sample calculation',lambda d:d['document'].update(goal='새 개요 문장'),None,observation)
    mutate('entity heading does not invalidate sample calculation',lambda d:d['model']['entities'][0].update(name='새 화면 이름'),None,observation)
    mutate('sample edit invalidates observed result',lambda d:d['samples']['datasets'][0]['rows']['item'][0].update(name='새 데이터'),'observation_stale',observation)
    mutate('expected behavior edit invalidates observed result',lambda d:d['samples']['scenarios'][0].update(expected_behavior='새 기대 동작'),'observation_stale',observation)
    mutate('cannot promote sample result to implementation',lambda d:d['observations'][0].update(method='implementation'),'observation_stale',observation)
    mutate('result scenario cannot repeat',lambda d:d['observations'].append(copy.deepcopy(d['observations'][0])),'observation_scenario',observation)
    def extra_dataset(d):
        dataset=copy.deepcopy(d['samples']['datasets'][0]);dataset['id']='DS-SECOND';d['samples']['datasets'].append(dataset)
    mutate('same PKs allowed in different datasets',extra_dataset,None)
    def numeric(d):
        for dataset in d['samples']['datasets']:
            for row in dataset['rows']['category']:
                if row['id']=='C1':row['id']=1
            for row in dataset['rows']['item']:
                if row['category_id']=='C1':row['category_id']=1.0
        for scenario in d['samples']['scenarios']:
            for ref in scenario['sample_refs']:
                if ref['entity_id']=='category' and ref['key']['id']=='C1':ref['key']['id']=1.0
    numeric_case=copy.deepcopy(simple);numeric(numeric_case);add('numeric 1 and 1.0 are the same key',numeric_case)
    mutate('boolean true is not numeric key 1',lambda d:d['samples']['datasets'][0]['rows']['item'][0].update(category_id=True),'sample_foreign_key',numeric_case)
    mutate('arbitrarily large integer rejected without overflow',lambda d:d['samples']['datasets'][0]['rows']['item'][0].update(name=10**400),'unsafe_number')
    mutate('safe integer range enforced',lambda d:d['samples']['datasets'][0]['rows']['item'][0].update(name=9007199254740992),'unsafe_number')
    mutate('missing scenario produces shared warning',lambda d:d['requirements'].append(dict(id='R-UNTESTED',title='미확인',description='샘플 없는 요구')),None)
    return output
