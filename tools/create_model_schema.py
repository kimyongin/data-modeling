"""Maintainer: derive NEW 1.1 contracts; never modify released 1.0 contracts."""
import copy,json
from pathlib import Path
R=Path(__file__).resolve().parent.parent
def dump(p,d):
    content=json.dumps(d,ensure_ascii=False,indent=2)+'\n'
    if p.exists() and p.read_text()!=content:
        relative=str(p.relative_to(R))
        if any(relative in json.loads(release.read_text()).get('files',{}) for release in (R/'releases').glob('*.json')):
            raise ValueError('Released contract is immutable; create a new version: '+relative)
    p.write_text(content)
text={'type':'string','minLength':1,'pattern':r'\S'};ident={'type':'string','pattern':'^[A-Za-z][A-Za-z0-9_-]*$'};ids={'type':'array','items':ident,'uniqueItems':True}
def obj(props,req=None):return dict(type='object',properties=props,required=list(props) if req is None else req,additionalProperties=False)
legacy=json.loads((R/'schemas/modeling-review-1.0.0.schema.json').read_text());plan=copy.deepcopy(legacy);plan['$id']='urn:data-modeling:modeling-review:1.1.0';plan['title']='Atomic design review 1.1.0';plan['properties']['version']={'const':'1.1.0'}
plan['properties']['rules']['items']=obj({'id':ident,'title':text,'topic':legacy['properties']['rules']['items']['properties']['topic'],'design_status':{'enum':['modeled','unmodeled','excluded','not_applicable']},'decision_status':{'enum':['proposed','agreed','open']},'reason':text,'requirements':ids,'entities':ids,'scenarios':ids,'review_points':ids},['id','title','topic','design_status','decision_status','requirements','entities','scenarios','review_points'])
impact=plan['properties']['change_impact'];impact['properties']['baseline_kind']={'enum':['none','design_document','production_schema','unknown']};impact['required']+=['baseline_kind'];impact['properties']['baseline_sha256']={'type':'string','pattern':'^[a-f0-9]{64}$'}
change=obj({'id':ident,'target_type':{'enum':['entity','column','relationship']},'entity_id':ident,'column_name':text,'relationship_id':ident,'change':{'enum':['added','modified','removed']},'before':{'type':['object','null']},'after':{'type':['object','null']},'reason':text,'requirements':ids},['id','target_type','change','before','after','reason','requirements'])
change['allOf']=[{'if':{'properties':{'target_type':{'const':kind}},'required':['target_type']},'then':{'required':fields}} for kind,fields in [('entity',['entity_id']),('column',['entity_id','column_name']),('relationship',['relationship_id'])]]
impact['properties']['changes']={'type':'array','items':change};impact['required']+=['changes']
dump(R/'schemas/modeling-review-1.1.0.schema.json',plan)
model=json.loads((R/'schemas/model-1.0.0.schema.json').read_text());model['$id']='urn:data-modeling:model:1.1.0';model['title']='Hand-authorable model document 1.1.0';model['properties']['format_version']={'const':'1.1.0'}
D=model['$defs'];rv=D['public_review'];rv['properties']['schema_version']={'const':'1.1.0'};D['build_metadata']['properties']['schema_version']={'const':'1.1.0'}
for x in rv['allOf']:
 then=x.get('then',{});props=then.get('properties',{})
 if 'entities' in props:props['entities']['items']['required']=['name','description','rows','requirements','sources']
D['insights']['required']=[];D['insights']['minProperties']=1
D['entity']['properties'].update(role={'enum':['core','supporting','optional']},inclusion_condition=text,unique_keys={'type':'array','items':{'type':'array','minItems':1,'items':text,'uniqueItems':True}})
D['entity'].setdefault('allOf',[]).append({'if':{'properties':{'role':{'const':'optional'}},'required':['role']},'then':{'required':['inclusion_condition']}})
choice=obj({'id':ident,'title':text,'benefit':text,'cost':text})
D['decision']['properties'].update(choices={'type':'array','minItems':2,'items':choice},selected_choice=ident)
D['decision'].setdefault('allOf',[]).extend([{'if':{'required':['choices']},'then':{'required':['selected_choice']}},{'if':{'required':['selected_choice']},'then':{'required':['choices']}}])
report=D['verification'];report['properties'].update(fingerprint_version={'const':'1'},input_fingerprint={'type':'string','pattern':'^sha256:[a-f0-9]{64}$'});report['required']+=['fingerprint_version','input_fingerprint']
res=report['properties']['results']['items'];res['properties'].update(method={'enum':['sample','simulation','implementation','manual','not_run']},scope=text);res['required']+=['method','scope']
# Keep old review records readable during explicit upgrades. New authoring uses 1.1.0.
newplan=copy.deepcopy(plan);newplan.pop('$schema');newplan.pop('$id')
oldplan=copy.deepcopy(legacy);oldplan.pop('$schema');oldplan.pop('$id')
rv['properties']['extensions']={'type':'object','properties':{'modeling_review':{'anyOf':[newplan,oldplan]}},'additionalProperties':True}
# The report is optional; when present all observations bind to the current review data.
dump(R/'schemas/model-1.1.0.schema.json',model)
