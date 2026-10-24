"""JSON contract and semantic checks. Returns one report used by CLI and builder."""
import json
from functools import lru_cache
from .contract import SCHEMA, MAX_BYTES, dependencies, load_json
from .fingerprint import value_key, typed_value, observation_fingerprint


def fail(code, path):
    raise ValueError(code+': '+path)


@lru_cache(maxsize=1)
def schema_validator():
    dependencies()
    from jsonschema import Draft202012Validator
    return Draft202012Validator(load_json(SCHEMA))


def validate_document(document):
    if not isinstance(document, dict) or document.get('version') != '2.0.0':
        fail('version', 'Only model document 2.0.0 is supported')
    error = next(schema_validator().iter_errors(document), None)
    if error:
        fail('schema', '/'.join(map(str, error.absolute_path))+': '+error.message)
    def depth(value, level=0):
        if level > 80:
            fail('depth', 'Maximum nesting is 80')
        if isinstance(value, dict):
            for child in value.values():
                depth(child, level+1)
        elif isinstance(value, list):
            for child in value:
                depth(child, level+1)
    depth(document)
    typed_value(document)
    if len((json.dumps(document, ensure_ascii=False, indent=2)+'\n').encode()) > MAX_BYTES:
        fail('file_size', 'Formatted JSON exceeds 20MB')
    collections = {k:document[k] for k in ['requirements','rules','decisions','issues','sources','assumptions','limitations']}
    collections.update(document['model'])
    collections.update({k:document['samples'][k] for k in ['datasets','scenarios']})
    collections['changes'] = document['change_impact']['changes']
    maps, ids = {}, set()
    for name, items in collections.items():
        maps[name] = {}
        for item in items:
            if item['id'] in ids:
                fail('duplicate_id', item['id'])
            ids.add(item['id'])
            maps[name][item['id']] = item
    def refs(item, field, target):
        for ident in item.get(field, []):
            if ident not in maps[target]:
                fail('reference', item.get('id','')+'/'+field+'/'+ident)
    targets = {'requirement_ids':'requirements','entity_ids':'entities','source_ids':'sources','decision_ids':'decisions','scenario_ids':'scenarios','issue_ids':'issues'}
    for items in collections.values():
        for item in items:
            for field, target in targets.items():
                refs(item, field, target)
    entities = maps['entities']
    for entity in entities.values():
        names = [a['name'] for a in entity['attributes']]
        if len(names) != len(set(names)):
            fail('attribute_duplicate', entity['id'])
        if set(entity.get('display_attributes', []))-set(names):
            fail('display_attribute', entity['id'])
        for key in [entity['primary_key'], *entity['unique_keys']]:
            if set(key)-set(names):
                fail('key_attribute', entity['id'])
        if len({value_key(k) for k in entity['unique_keys']}) != len(entity['unique_keys']):
            fail('unique_duplicate', entity['id'])
    for domain in maps['domains'].values():
        if domain['id'] == 'all':
            fail('reserved_id', 'all')
    for relation in maps['relationships'].values():
        for side in ['from','to']:
            endpoint = relation[side]
            entity = entities.get(endpoint['entity_id'])
            if entity is None or set(endpoint['attributes'])-{a['name'] for a in entity['attributes']}:
                fail('relationship_endpoint', relation['id'])
        a, b = relation['from'], relation['to']
        if relation['foreign_key']:
            if not a['attributes'] or len(a['attributes']) != len(b['attributes']):
                fail('foreign_key_arity', relation['id'])
            parent = entities[b['entity_id']]
            if b['attributes'] not in [parent['primary_key'], *parent['unique_keys']]:
                fail('foreign_key_unique', relation['id'])
    for dataset in maps['datasets'].values():
        for eid, rows in dataset['rows'].items():
            if eid not in entities:
                fail('dataset_entity', dataset['id']+'/'+eid)
            entity = entities[eid]
            attrs = {a['name']:a for a in entity['attributes']}
            for row in rows:
                if set(row)-set(attrs):
                    fail('sample_attribute', dataset['id']+'/'+eid)
                for name, attribute in attrs.items():
                    if (attribute['required'] or name in entity['primary_key']) and row.get(name) is None:
                        fail('sample_required', dataset['id']+'/'+eid+'/'+name)
                for name in entity['primary_key']:
                    if isinstance(row[name], (dict,list)):
                        fail('sample_primary_scalar', dataset['id']+'/'+eid)
            for fields in [entity['primary_key'], *entity['unique_keys']]:
                if not fields:
                    continue
                keys = [value_key([r[f] for f in fields]) for r in rows if all(r.get(f) is not None for f in fields)]
                if len(keys) != len(set(keys)):
                    fail('sample_duplicate', dataset['id']+'/'+eid+'/'+','.join(fields))
        for relation in maps['relationships'].values():
            if not relation['foreign_key']:
                continue
            a, b = relation['from'], relation['to']
            parents = {value_key([row[f] for f in b['attributes']]) for row in dataset['rows'].get(b['entity_id'],[]) if all(row.get(f) is not None for f in b['attributes'])}
            for row in dataset['rows'].get(a['entity_id'],[]):
                if any(row.get(f) is None for f in a['attributes']):
                    continue
                if value_key([row[f] for f in a['attributes']]) not in parents:
                    fail('sample_foreign_key', dataset['id']+'/'+relation['id'])
    for scenario in maps['scenarios'].values():
        dataset = maps['datasets'].get(scenario['dataset_id'])
        if dataset is None or not scenario['requirement_ids']:
            fail('scenario_dataset', scenario['id'])
        for ref in scenario['sample_refs']:
            eid = ref['entity_id']
            if eid not in scenario['entity_ids']:
                fail('sample_reference_entity', scenario['id'])
            pk = entities[eid]['primary_key']
            if not pk or set(ref['key']) != set(pk):
                fail('sample_reference_key', scenario['id'])
            if sum(all(k in row and value_key(row[k]) == value_key(ref['key'][k]) for k in pk) for row in dataset['rows'].get(eid,[])) != 1:
                fail('sample_reference_row', scenario['id'])
    for rule in maps['rules'].values():
        if rule['design_status'] == 'modeled':
            covered = {r for sid in rule['scenario_ids'] for r in maps['scenarios'][sid]['requirement_ids']}
            if not rule['requirement_ids'] or not rule['scenario_ids'] or set(rule['requirement_ids'])-covered:
                fail('rule_coverage', rule['id'])
        if rule['design_status'] in ['unmodeled','excluded','not_applicable'] and not rule.get('reason'):
            fail('rule_reason', rule['id'])
        if (rule['agreement_status'] == 'open' or rule['design_status'] in ['unmodeled','excluded']) and not rule['issue_ids']:
            fail('rule_issue', rule['id'])
        if rule['agreement_status'] == 'open' and any(maps['issues'][qid]['kind'] == 'verification' for qid in rule['issue_ids']):
            fail('rule_policy', rule['id'])
    for decision in maps['decisions'].values():
        choices = [c['id'] for c in decision['choices']]
        if len(choices) != len(set(choices)) or (decision.get('selected_choice') not in choices and decision['status'] != 'open') or ('selected_choice' in decision and decision['selected_choice'] not in choices):
            fail('decision_choice', decision['id'])
    notes = set(maps['assumptions']) | set(maps['limitations']) | set(maps['issues'])
    impact = document['change_impact']
    areas = set()
    for item in impact['areas']:
        refs(item, 'entity_ids', 'entities')
        refs(item, 'issue_ids', 'issues')
        if item['area'] in areas or item['note_id'] not in notes:
            fail('impact_note', item['area'])
        areas.add(item['area'])
        if item['status'] == 'affected' and not item['entity_ids']:
            fail('impact_target', item['area'])
        if item['status'] == 'unknown' and not item['issue_ids']:
            fail('impact_issue', item['area'])
        if impact['baseline']['kind'] == 'unknown' and item['status'] == 'unaffected':
            fail('impact_baseline', item['area'])
    for change in impact['changes']:
        if change['target_type'] == 'relationship':
            target = maps['relationships'].get(change['relationship_id'])
        else:
            target = entities.get(change['entity_id'])
            if change['target_type'] == 'attribute':
                target = next((a for a in (target or {}).get('attributes',[]) if a['name'] == change['attribute_name']),None)
        if change['change'] == 'removed':
            if target is not None or change['after'] is not None or not change['before']:
                fail('change_removed', change['id'])
        elif target is None or not change['after'] or any(k not in target or value_key(v) != value_key(target[k]) for k,v in change['after'].items()):
            fail('change_after', change['id'])
        if change['change'] == 'added' and change['before'] is not None:
            fail('change_before', change['id'])
        if change['change'] == 'modified' and not change['before']:
            fail('change_before', change['id'])
    diagram = document['document']['overview']['diagram']
    node_ids = [n['id'] for n in diagram['nodes']]
    if len(node_ids) != len(set(node_ids)) or any(e['from'] not in node_ids or e['to'] not in node_ids for e in diagram['links']):
        fail('overview_link', 'document/overview/diagram')
    seen = set()
    for observation in document['observations']:
        sid = observation['scenario_id']
        if sid not in maps['scenarios'] or sid in seen:
            fail('observation_scenario', sid)
        seen.add(sid)
        if observation['input_fingerprint'] != observation_fingerprint(document, sid, observation['method']):
            fail('observation_stale', sid)
    warnings = []
    def warn(code, path, message):
        warnings.append(dict(code=code,path=path,message=message))
    for requirement in document['requirements']:
        if not any(requirement['id'] in s['requirement_ids'] for s in maps['scenarios'].values()):
            warn('requirement_without_scenario',requirement['id'],'확인할 상황이 연결되지 않았습니다.')
    if document['document']['complexity']['level'] == 'complex':
        for topic in sorted(set(['identity','ownership','lifecycle','time','aggregation','concurrency','integration','access','retention'])-{r['topic'] for r in document['rules']}):
            warn('rule_topic_unreviewed',topic,'관련 업무 규칙을 검토하거나 해당 없음의 이유를 남기세요.')
        if not document['decisions']:
            warn('alternatives_uncompared','decisions','주요 선택의 대안을 비교하세요.')
    if impact['baseline']['kind'] != 'new':
        for area in sorted(set(['writes','reads','contracts','existing_data','history','rollout','rollback'])-areas):
            warn('impact_area_unreviewed',area,'변경 영향의 검토가 빠져 있습니다.')
    return dict(valid=True, version=document['version'], warnings=warnings, scope='형식·참조·샘플·결과 대응 검사이며 업무 합의나 운영 구현 확인이 아닙니다.')
