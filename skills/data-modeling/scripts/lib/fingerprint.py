"""Cross-runtime typed JSON hash and scenario dependency closure."""
import hashlib, json, math, struct

def typed_value(value):
    if value is None:
        return ['n']
    if isinstance(value, bool):
        return ['b', value]
    if isinstance(value, (int, float)):
        if isinstance(value, int) and abs(value) > 9007199254740991:
            raise ValueError('unsafe_number')
        if not math.isfinite(value) or (float(value).is_integer() and abs(value) > 9007199254740991):
            raise ValueError('unsafe_number')
        return ['d', struct.pack('>d', 0.0 if value == 0 else float(value)).hex()]
    if isinstance(value, str):
        try:
            return ['s', value.encode('utf-8').hex()]
        except UnicodeEncodeError as exc:
            raise ValueError('invalid_unicode') from exc
    if isinstance(value, list):
        return ['a', [typed_value(x) for x in value]]
    if isinstance(value, dict):
        entries = sorted(((typed_value(k)[1], typed_value(v)) for k, v in value.items()))
        return ['o', entries]
    raise ValueError('invalid_json_value')

def value_key(value):
    return json.dumps(typed_value(value), ensure_ascii=True, separators=(',', ':'))

def tree_fingerprint(review):
    """Hash of typed JSON tree v1: UTF-8 hex strings, IEEE-754 numbers, sorted UTF-8 keys."""
    return 'sha256:' + hashlib.sha256(value_key(review).encode('ascii')).hexdigest()

def observation_input(document, scenario_id, method):
    scenario = next((s for s in document['samples']['scenarios'] if s['id'] == scenario_id))
    if method == 'manual':
        return {k: v for k, v in document.items() if k != 'observations'}
    entities = {e['id']: e for e in document['model']['entities']}
    visible = set(scenario['entity_ids'])
    while True:
        before = len(visible)
        for relation in document['model']['relationships']:
            if relation['from']['entity_id'] in visible:
                visible.add(relation['to']['entity_id'])
        if len(visible) == before:
            break
    dataset = next((d for d in document['samples']['datasets'] if d['id'] == scenario['dataset_id']))
    return dict(method=method, scenario=scenario, entities=[{k: v for k, v in e.items() if k in ['id', 'attributes', 'primary_key', 'unique_keys', 'constraints', 'condition', 'role']} | {'attributes': [{k: v for k, v in a.items() if k in ['name', 'type', 'required']} for a in e['attributes']]} for e in document['model']['entities'] if e['id'] in visible], relationships=[r for r in document['model']['relationships'] if r['from']['entity_id'] in visible and r['to']['entity_id'] in visible], rules=[r for r in document['rules'] if scenario_id in r['scenario_ids']], decisions=[d for d in document['decisions'] if set(d['requirement_ids']) & set(scenario['requirement_ids'])], rows={eid: dataset['rows'].get(eid, []) for eid in sorted(visible)})

def observation_fingerprint(document, scenario_id, method):
    return tree_fingerprint(observation_input(document, scenario_id, method))
