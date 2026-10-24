"""Sample integrity and content-bound observation records; paired with assets/model-integrity.js."""
import hashlib,json,math,re,struct


def typed_value(value):
    if value is None:return ['n']
    if isinstance(value,bool):return ['b',value]
    if isinstance(value,(int,float)):
        if not math.isfinite(value) or (float(value).is_integer() and abs(value)>9007199254740991):raise ValueError('unsafe_number')
        return ['d',struct.pack('>d',0.0 if value==0 else float(value)).hex()]
    if isinstance(value,str):
        try:return ['s',value.encode('utf-8').hex()]
        except UnicodeEncodeError as exc:raise ValueError('invalid_unicode') from exc
    if isinstance(value,list):return ['a',[typed_value(x) for x in value]]
    if isinstance(value,dict):
        entries=sorted((typed_value(k)[1],typed_value(v)) for k,v in value.items())
        return ['o',entries]
    raise ValueError('invalid_json_value')


def value_key(value):return json.dumps(typed_value(value),ensure_ascii=True,separators=(',',':'))


def review_fingerprint(review):
    """Hash of typed JSON tree v1: UTF-8 hex strings, IEEE-754 numbers, sorted UTF-8 keys."""
    return 'sha256:'+hashlib.sha256(value_key(review).encode('ascii')).hexdigest()


def validate_samples(review):
    entities={e['id']:e for e in review['entities']}
    for e in review['entities']:
        columns={c['name']:c for c in e['columns']};pk=[c['name'] for c in e['columns'] if re.search(r'\bPK\b',c.get('key','')) or re.search(r'PRIMARY\s+KEY',c.get('type',''),re.I)]
        unique=e.get('unique_keys',[]) # UQ is a legacy display hint; explicit tuples define the scope.
        for fields in unique:
            if set(fields)-set(columns):raise ValueError('sample_unique_columns: '+e['id'])
        for row in e.get('rows',[]):
            for name,c in columns.items():
                if (name in pk or c.get('nullable') is False) and (name not in row or row[name] is None):raise ValueError('sample_required: '+e['id']+'.'+name)
            for name in pk:
                if isinstance(row[name],(dict,list)):raise ValueError('sample_primary_key_scalar: '+e['id']+'.'+name)
        for fields,is_pk in [(pk,True)] if pk else []:
            keys=[value_key([row[f] for f in fields]) for row in e.get('rows',[])]
            if len(keys)!=len(set(keys)):raise ValueError('sample_primary_key_duplicate: '+e['id'])
        for fields in unique:
            keys=[value_key([row[f] for f in fields]) for row in e.get('rows',[]) if all(row.get(f) is not None for f in fields)]
            if len(keys)!=len(set(keys)):raise ValueError('sample_unique_duplicate: '+e['id'])
    for relation in review['relationships']:
        if not relation.get('foreign_key'):continue
        a,b=relation['from'],relation['to'];target={}
        for row in entities[b['entity']].get('rows',[]):
            if any(row.get(k) is None for k in b['columns']):continue
            key=value_key([row[k] for k in b['columns']]);target[key]=target.get(key,0)+1
        if any(n>1 for n in target.values()):raise ValueError('sample_fk_target_duplicate: '+relation['id'])
        for row in entities[a['entity']].get('rows',[]):
            if any(row.get(k) is None for k in a['columns']):continue
            if target.get(value_key([row[k] for k in a['columns']]))!=1:raise ValueError('sample_fk_missing: '+relation['id'])


def validate_observations(document):
    report=document.get('verification')
    if report is None:return
    if document['format_version']=='1.0.0':return # Kept as explicitly unbound historical records in the viewer.
    if report['input_fingerprint']!=review_fingerprint(document['review']):raise ValueError('stale_verification: 모델·샘플이 변경되었습니다. 이전 확인 결과를 제거하거나 실제로 다시 확인하세요.')
    for result in report['results']:
        if (result['status']=='not_run')!=(result['method']=='not_run'):raise ValueError('verification_method_status: '+result['id'])
