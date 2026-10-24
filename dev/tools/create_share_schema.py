import copy,json
from pathlib import Path
root=Path(__file__).resolve().parents[2]/'skills/data-modeling';review=json.loads((root/'references/schemas/review-1.0.0.schema.json').read_text())
review.pop('$schema');review.pop('$id');review.pop('title');review['properties'].pop('sqlite',None)
scenario=review['$defs']['scenario'];allowed={'id','title','requirements','entities','explanation','sample_refs','sample_note'}
scenario['properties']={k:v for k,v in scenario['properties'].items() if k in allowed};scenario.pop('oneOf')
# Move definitions up to the envelope root so existing local references stay canonical.
defs=review.pop('$defs');defs['public_review']=review
text={'type':'string','minLength':1,'pattern':r'\S'};digest={'type':'string','pattern':'^[a-f0-9]{64}$'}
def obj(props):return dict(type='object',properties=props,required=list(props),additionalProperties=False)
defs['verification']=obj({'engine':text,'scope':text,'executed_at':text,'results':{'type':'array','items':obj({'id':{'type':'string','pattern':'^[A-Za-z][A-Za-z0-9_-]*$'},'status':{'enum':['pass','fail','not_run']},'message':text})}})
defs['build_metadata']=obj({'schema_version':{'const':'1.0.0'},'renderer_version':{'type':'string','pattern':r'^\d+\.\d+\.\d+$'},'review_profile':{'enum':['standard','compatibility']},'input_sha256':digest,'verification_sha256':{'anyOf':[digest,{'type':'null'}]},'renderer_release_sha256':digest})
schema={'$schema':'https://json-schema.org/draft/2020-12/schema','$id':'urn:data-modeling:share:1.0.0','title':'Portable displayed model review 1.0.0',**obj({'format':{'const':'data-modeling-share'},'format_version':{'const':'1.0.0'},'renderer_version':{'type':'string','pattern':r'^\d+\.\d+\.\d+$'},'payload':obj({'review':{'$ref':'#/$defs/public_review'},'verification':{'anyOf':[{'$ref':'#/$defs/verification'},{'type':'null'}]},'build_metadata':{'$ref':'#/$defs/build_metadata'}}),'checksum':digest}),'$defs':defs}
(root/'references/schemas/share-1.0.0.schema.json').write_text(json.dumps(schema,ensure_ascii=False,indent=2)+'\n')
# The primary hand-authorable document is display data, independent of renderer pins.
model_defs=copy.deepcopy(defs)
model_review=model_defs['public_review'];model_review['properties'].pop('renderer_version');model_review['required'].remove('renderer_version')
model={'$schema':'https://json-schema.org/draft/2020-12/schema','$id':'urn:data-modeling:model:1.0.0','title':'Hand-authorable model document 1.0.0',**obj({'format':{'const':'data-modeling-model'},'format_version':{'const':'1.0.0'},'review':{'$ref':'#/$defs/public_review'},'verification':{'anyOf':[{'$ref':'#/$defs/verification'},{'type':'null'}]},'build_metadata':{'anyOf':[{'$ref':'#/$defs/build_metadata'},{'type':'null'}]}}),'$defs':model_defs}
model['required']=['format','format_version','review']
(root/'references/schemas/model-1.0.0.schema.json').write_text(json.dumps(model,ensure_ascii=False,indent=2)+'\n')
