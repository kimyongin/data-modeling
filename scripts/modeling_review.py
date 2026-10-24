"""Validate authored review links. No claim of semantic correctness or business completeness."""
import re
from collections import defaultdict
from review_contract import ROOT,load_json
from model_integrity import value_key
TOPICS=('identity','ownership','lifecycle','time','aggregation','concurrency','integration','access','retention')
AREAS=('writes','reads','contracts','existing_data','history','rollout','rollback')


def assess_review(data):
    from jsonschema import Draft202012Validator
    warnings=[]
    def warn(code,path,message):warnings.append(dict(code=code,path=path,message=message))
    if data.get('schema_version')=='1.1.0':
        for decision in data.get('decisions',[]):
            if 'choices' in decision:
                ids=[x['id'] for x in decision['choices']]
                if len(ids)!=len(set(ids)) or decision.get('selected_choice') not in ids:raise ValueError('review_choices: '+decision['id'])
    plan=data.get('extensions',{}).get('modeling_review');result=dict(recorded=plan is not None,scope='Authored design review only; not execution, approval, or proof of completeness',warnings=warnings)
    if 'modeling_review' not in data.get('extensions',{}):
        warn('review_not_recorded','/extensions/modeling_review','검토 기록이 없습니다. 새 사례는 복잡도·대안·규칙·변경 영향을 기록하세요.');return result
    version=plan.get('version') if isinstance(plan,dict) else None
    if version not in ('1.0.0','1.1.0'):raise ValueError('review_version: unsupported modeling review')
    schema=load_json(ROOT/('schemas/modeling-review-'+version+'.schema.json'));errors=list(Draft202012Validator(schema).iter_errors(plan))
    if errors:
        e=errors[0];raise ValueError('review_schema: /'+'/'.join(map(str,e.absolute_path))+': '+e.message)
    modern=version=='1.1.0';maps={key:{x['id']:x for x in data.get(key,[])} for key in ('requirements','entities','scenarios','decisions','review_points','relationships','sources','domains')}
    all_ids=set().union(*(set(m) for m in maps.values()));notes={}
    for group in ('assumptions','limitations'):
        for note in data.get(group,[]):
            if not isinstance(note,dict) or not note.get('id'):continue
            if note['id'] in all_ids or note['id'] in notes:raise ValueError('review_note_duplicate: '+note['id'])
            notes[note['id']]=note
    def refs(item,field,group):
        for id_ in item.get(field,[]):
            if id_ not in maps[group]:raise ValueError('review_reference: '+group+': '+id_)
    def unique(items,key):
        values=[x[key] for x in items]
        if len(values)!=len(set(values)):raise ValueError('review_duplicate: '+key)
    alt=plan['alternatives'];unique(alt['reviews'],'decision_id')
    if not alt['reviews'] and not alt.get('not_needed_reason','').strip():raise ValueError('review_alternatives_reason: describe why comparison is unnecessary')
    for choice in alt['reviews']:
        decision=maps['decisions'].get(choice['decision_id'])
        if not decision:raise ValueError('review_decision_missing: '+choice['decision_id'])
        if modern:
            choices=decision.get('choices',[]);unique(choices,'id')
            if len(choices)<2 or decision.get('selected_choice') not in {x['id'] for x in choices}:raise ValueError('review_choices: '+decision['id'])
            if decision.get('alternatives'):warn('duplicate_comparison_forms','/decisions/'+decision['id'],'구조화한 선택지와 대안 설명의 중복 원문을 정리하세요.')
        elif not str(decision.get('alternatives','')).strip():raise ValueError('review_comparison_missing: '+decision['id'])
        if decision.get('summary') and decision['summary']!=decision['rationale']:warn('hidden_rationale','/decisions/'+decision['id'],'요약에서 선택 이유와 대가가 유지되는지 읽어 보세요.')
    unique(plan['rules'],'id' if modern else 'topic')
    rule_ids=set()
    for rule in plan['rules']:
        for field,group in [('requirements','requirements'),('scenarios','scenarios'),('review_points','review_points')]+([('entities','entities')] if modern else []):refs(rule,field,group)
        if modern:
            if rule['id'] in all_ids or rule['id'] in notes:raise ValueError('review_rule_duplicate: '+rule['id'])
            rule_ids.add(rule['id']);modeled=rule['design_status']=='modeled';needs_issue=rule['decision_status']=='open' or rule['design_status'] in ('unmodeled','excluded');open_policy=rule['decision_status']=='open'
            if rule['design_status'] in ('unmodeled','excluded','not_applicable') and not rule.get('reason','').strip():raise ValueError('review_rule_reason: '+rule['id'])
        else:modeled=rule['status']=='addressed';needs_issue=rule['status'] in ('open','excluded');open_policy=rule['status']=='open'
        if modeled:
            if not rule['requirements'] or not rule['scenarios']:raise ValueError('review_rule_evidence: '+rule.get('id',rule['topic']))
            coverage=set().union(*(set(maps['scenarios'][sid]['requirements']) for sid in rule['scenarios']))
            if not set(rule['requirements'])<=coverage:raise ValueError('review_rule_coverage: '+rule.get('id',rule['topic']))
            if any(not set(maps['scenarios'][sid]['requirements'])&set(rule['requirements']) for sid in rule['scenarios']):raise ValueError('review_scenario_coverage: '+rule.get('id',rule['topic']))
        if needs_issue and not rule['review_points']:raise ValueError('review_rule_issue: '+rule.get('id',rule['topic']))
        if open_policy and any(maps['review_points'][qid]['kind']=='verification' for qid in rule['review_points']):raise ValueError('review_policy_as_test: '+rule.get('id',rule['topic']))
    impact=plan['change_impact'];unique(impact['items'],'area')
    for item in impact['items']:
        refs(item,'entities','entities');refs(item,'review_points','review_points')
        if item['note_ref'] not in notes and item['note_ref'] not in maps['review_points']:raise ValueError('review_impact_note: '+item['note_ref'])
        if item['status']=='unknown' and not item['review_points']:raise ValueError('review_impact_issue: '+item['area'])
        if item['status']=='affected' and not item['entities']:raise ValueError('review_impact_targets: '+item['area'])
        if impact['baseline']=='unknown' and item['status']=='unaffected':raise ValueError('review_unknown_no_impact: '+item['area'])
    if modern:
        if (impact['baseline']=='new')!=(impact['baseline_kind']=='none'):raise ValueError('review_baseline_kind: new design requires none')
        unique(impact['changes'],'id')
        for change in impact['changes']:
            if change['id'] in all_ids or change['id'] in notes or change['id'] in rule_ids:raise ValueError('review_change_duplicate: '+change['id'])
            refs(change,'requirements','requirements')
            if change['target_type']=='relationship':target=maps['relationships'].get(change.get('relationship_id'))
            else:
                entity=maps['entities'].get(change.get('entity_id'));target=entity if change['target_type']=='entity' else next((c for c in (entity or {}).get('columns',[]) if c['name']==change.get('column_name')),None)
            if change['change']=='removed':
                if target is not None or change['after'] is not None or not isinstance(change['before'],dict) or not change['before']:raise ValueError('review_removed_target: '+change['id'])
            else:
                if target is None or not isinstance(change['after'],dict) or not change['after']:raise ValueError('review_change_target: '+change['id'])
                if any(k not in target or value_key(v)!=value_key(target[k]) for k,v in change['after'].items()):raise ValueError('review_change_after: '+change['id'])
                if change['change']=='added' and change['before'] is not None:raise ValueError('review_added_before: '+change['id'])
                if change['change']=='modified' and (not isinstance(change['before'],dict) or not change['before']):raise ValueError('review_modified_before: '+change['id'])
    level=plan['complexity']['level']
    if level=='complex':
        for topic in sorted(set(TOPICS)-{x['topic'] for x in plan['rules']}):warn('rule_topic_unreviewed','/rules/'+topic,'복합 사례의 관련 규칙 영역을 검토하거나 해당 없음의 이유를 기록하세요.')
        if not alt['reviews']:warn('alternatives_uncompared','/alternatives','주요 선택의 실제 대안 비교를 확인하세요.')
    if impact['baseline']!='new':
        for area in sorted(set(AREAS)-{x['area'] for x in impact['items']}):warn('impact_area_unreviewed','/change_impact/'+area,'이 영향 영역의 검토가 빠져 있습니다.')
    for req in data['requirements']:
        if req.get('design') and req.get('design_points'):warn('duplicate_design_forms','/requirements/'+req['id'],'설계안의 원문은 design 또는 design_points 한 곳에 작성하세요.')
        if not any(req['id'] in s.get('requirements',[]) for s in data['scenarios']):warn('requirement_without_scenario','/requirements/'+req['id'],'확인할 상황이 연결되지 않았습니다.')
    prose=defaultdict(list)
    for e in data['entities']:
        for key,value in [(k,e.get(k,'')) for k in ('description','example','review_question')]+[(k,e.get('insights',{}).get(k,'')) for k in ('purpose','tradeoff','risk')]:
            normalized=re.sub(r'\s+',' ',value).strip()
            if len(normalized)>=50:prose[normalized].append('/entities/'+e['id']+'/'+key)
    for paths in prose.values():
        if len(paths)>1:warn('repeated_explanation',paths[0],'반복된 장문 설명은 공통 판단으로 연결하세요: '+', '.join(paths[1:]))
    result.update(version=version,complexity=level,baseline=impact['baseline'],compared_decisions=len(alt['reviews']),rules={status:sum((x['design_status'] if modern else x['status'])==status for x in plan['rules']) for status in (('modeled','unmodeled','excluded','not_applicable') if modern else ('addressed','open','excluded','not_applicable'))},open_decisions=sum(x['decision_status']=='open' for x in plan['rules']) if modern else sum(x['status']=='open' for x in plan['rules']),impact_items=len(impact['items']))
    return result
