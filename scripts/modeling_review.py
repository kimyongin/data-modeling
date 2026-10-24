"""Validate authored design-review links; report omissions without claiming business completeness."""
import re
from collections import defaultdict
from review_contract import ROOT, load_json

TOPICS = ('identity','ownership','lifecycle','time','aggregation','concurrency','integration','access','retention')
AREAS = ('writes','reads','contracts','existing_data','history','rollout','rollback')


def assess_review(data):
    from jsonschema import Draft202012Validator
    warnings=[]
    def warn(code,path,message): warnings.append(dict(code=code,path=path,message=message))
    plan=data.get('extensions',{}).get('modeling_review')
    result=dict(recorded='modeling_review' in data.get('extensions',{}),scope='Authored design review only; not execution, approval, or proof of completeness',warnings=warnings)
    if 'modeling_review' not in data.get('extensions',{}):
        warn('review_not_recorded','/extensions/modeling_review','기존 파일은 열 수 있습니다. 새 사례는 복잡도·대안·업무 규칙·변경 영향 검토를 기록하세요.')
        return result
    errors=list(Draft202012Validator(load_json(ROOT/'schemas/modeling-review-1.0.0.schema.json')).iter_errors(plan))
    if errors:
        e=errors[0];raise ValueError('Modeling review: /'+'/'.join(map(str,e.absolute_path))+': '+e.message)
    maps={key:{x['id']:x for x in data.get(key,[])} for key in ('requirements','entities','scenarios','decisions','review_points','relationships','sources','domains')}
    notes={n['id']:n for key in ('assumptions','limitations') for n in data.get(key,[]) if isinstance(n,dict) and n.get('id')}
    # Note IDs must be unambiguous, including against ordinary model IDs.
    note_ids=[n['id'] for key in ('assumptions','limitations') for n in data.get(key,[]) if isinstance(n,dict) and n.get('id')]
    if len(note_ids)!=len(set(note_ids)) or set(note_ids)&set().union(*(set(m) for m in maps.values())):
        raise ValueError('Modeling review note IDs must be unique across the document')
    def refs(item,field,group):
        for id_ in item.get(field,[]):
            if id_ not in maps[group]:raise ValueError('Modeling review: unknown '+group+' reference '+id_)
    def unique(items,key):
        values=[x[key] for x in items]
        if len(values)!=len(set(values)):raise ValueError('Modeling review: duplicate '+key)
    alternatives=plan['alternatives'];unique(alternatives['reviews'],'decision_id')
    if not alternatives['reviews'] and not alternatives.get('not_needed_reason','').strip():
        raise ValueError('Modeling review: explain why alternatives are unnecessary or link a real comparison')
    for choice in alternatives['reviews']:
        decision=maps['decisions'].get(choice['decision_id'])
        if not decision:raise ValueError('Modeling review: unknown decision '+choice['decision_id'])
        if not str(decision.get('alternatives','')).strip():raise ValueError('Modeling review: comparison must be visible in decisions[].alternatives')
        if decision.get('summary') and decision['summary']!=decision['rationale']:
            warn('hidden_rationale','/decisions/'+decision['id'],'뷰어는 summary를 우선합니다. 선택 이유·포기한 이점이 요약에도 남아 있는지 읽어 보세요.')
    unique(plan['rules'],'topic')
    for rule in plan['rules']:
        refs(rule,'requirements','requirements');refs(rule,'scenarios','scenarios');refs(rule,'review_points','review_points')
        if rule['status']=='addressed':
            if not rule['requirements'] or not rule['scenarios']:raise ValueError('Modeling review: addressed rule requires requirements and scenarios: '+rule['topic'])
            coverage=set().union(*(set(maps['scenarios'][sid]['requirements']) for sid in rule['scenarios']))
            if not set(rule['requirements'])<=coverage:raise ValueError('Modeling review: rule requirements are not all covered by linked scenarios: '+rule['topic'])
            for sid in rule['scenarios']:
                if not set(maps['scenarios'][sid]['requirements'])&set(rule['requirements']):raise ValueError('Modeling review: rule/scenario requirements do not overlap: '+sid)
        if rule['status'] in ('open','excluded') and not rule['review_points']:
            raise ValueError('Modeling review: open/excluded rule needs a visible review point: '+rule['topic'])
        for qid in rule['review_points']:
            if rule['status']=='open' and maps['review_points'][qid]['kind']=='verification':
                raise ValueError('Modeling review: unresolved business policy is not an execution-only issue: '+qid)
    impact=plan['change_impact'];unique(impact['items'],'area')
    for item in impact['items']:
        refs(item,'entities','entities');refs(item,'review_points','review_points')
        note=notes.get(item['note_ref']) or maps['review_points'].get(item['note_ref'])
        if not note:raise ValueError('Modeling review: impact explanation must reference a visible note or review point: '+item['note_ref'])
        if item['status']=='unknown' and not item['review_points']:raise ValueError('Modeling review: unknown impact needs a visible unresolved point: '+item['area'])
        if item['status']=='affected' and not item['entities']:raise ValueError('Modeling review: affected impact needs model targets: '+item['area'])
        if impact['baseline']=='unknown' and item['status']=='unaffected':raise ValueError('Modeling review: unknown baseline cannot establish no impact: '+item['area'])
        if impact['baseline']=='existing' and item['area'] in ('existing_data','rollout','rollback') and item['status']=='not_applicable':
            warn('migration_not_applicable','/change_impact/'+item['area'],'기존 시스템의 데이터 전환·배포·복구를 제외하는 근거를 원문에서 확인하세요.')
    level=plan['complexity']['level']
    if level=='complex':
        for topic in sorted(set(TOPICS)-{x['topic'] for x in plan['rules']}):warn('rule_topic_unreviewed','/rules/'+topic,'복합 사례에서 이 규칙 영역을 검토했는지 확인하세요. 해당 없으면 이유를 기록하세요.')
        if not alternatives['reviews']:warn('alternatives_uncompared','/alternatives','복합 사례의 주요 선택에 실제 대안 비교가 없습니다. 제외 이유를 다시 검토하세요.')
    if impact['baseline']!='new':
        for area in sorted(set(AREAS)-{x['area'] for x in impact['items']}):warn('impact_area_unreviewed','/change_impact/'+area,'기존 구조 또는 미확인 기준의 변경 영향을 검토하지 않았습니다.')
    for req in data['requirements']:
        if req.get('design') and req.get('design_points'):warn('duplicate_design_forms','/requirements/'+req['id'],'design과 design_points 중 하나만 작성하세요. 같은 설명의 두 원본이 생깁니다.')
        if not any(req['id'] in s.get('requirements',[]) for s in data['scenarios']):warn('requirement_without_scenario','/requirements/'+req['id'],'요구사항을 확인할 샘플 상황이 연결되지 않았습니다.')
    prose=defaultdict(list)
    for e in data['entities']:
        for key in ('description','example','review_question'):
            value=e.get(key,'');normalized=re.sub(r'\s+',' ',value).strip()
            if len(normalized)>=50:prose[normalized].append('/entities/'+e['id']+'/'+key)
        for key in ('purpose','tradeoff','risk'):
            normalized=re.sub(r'\s+',' ',e.get('insights',{}).get(key,'')).strip()
            if len(normalized)>=50:prose[normalized].append('/entities/'+e['id']+'/insights/'+key)
    for paths in prose.values():
        if len(paths)>1:warn('repeated_explanation',paths[0],'같은 장문 설명이 반복됩니다. 공통 판단은 한 번 작성하고 해당 ID를 연결하세요: '+', '.join(paths[1:]))
    result.update(complexity=level,baseline=impact['baseline'],compared_decisions=len(alternatives['reviews']),rules={status:sum(x['status']==status for x in plan['rules']) for status in ('addressed','open','excluded','not_applicable')},impact_items=len(impact['items']))
    return result
