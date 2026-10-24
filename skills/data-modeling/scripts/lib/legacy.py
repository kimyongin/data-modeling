"""Convert old authoring inputs to display-only JSON. Never execute SQL or render HTML."""
import copy
from .contract import validate_schema
from .model_integrity import review_fingerprint
from .references import validate_references


def make_document(data, report=None, input_sha256=None, allow_compatibility=False):
    validate_schema(data, 'review-1.0.0.schema.json')
    if data['review_profile'] == 'compatibility' and not allow_compatibility:
        raise ValueError('Compatibility input needs explicit --allow-compatibility')
    validate_references(data, executable=True)
    if report is not None:
        if not isinstance(report, dict) or not isinstance(report.get('results'), list):
            raise ValueError('Verification report requires results')
        if report.get('input_sha256') != input_sha256:
            raise ValueError('Verification report is stale or belongs to another input')
        for key in ('engine', 'scope', 'executed_at'):
            if not isinstance(report.get(key), str) or not report[key].strip():
                raise ValueError('Verification report requires ' + key)
        ids = [r['id'] for r in report['results']]
        if len(ids) != len(set(ids)) or set(ids) != {s['id'] for s in data['scenarios']}:
            raise ValueError('Verification IDs do not match scenarios')
        if any(r.get('status') not in ('pass', 'fail', 'not_run') for r in report['results']):
            raise ValueError('Invalid verification status')
    review = copy.deepcopy({k: v for k, v in data.items() if k not in ('sqlite', 'scenarios', 'renderer_version')})
    review['schema_version'] = '1.1.0'
    allowed = ('id', 'title', 'requirements', 'entities', 'explanation', 'sample_refs', 'sample_note')
    review['scenarios'] = [{k: copy.deepcopy(v) for k, v in case.items() if k in allowed} for case in data['scenarios']]
    document = dict(format='data-modeling-model', format_version='1.1.0', review=review)
    if report is not None:
        cases = {c['id']: c for c in data['scenarios']}
        results = []
        for result in report['results']:
            case, status = cases[result['id']], result['status']
            message = {'pass': '예시에서 예상한 동작을 확인했습니다.', 'fail': '예상과 다른 결과가 나왔습니다. 설계와 확인 조건을 다시 검토해야 합니다.', 'not_run': '아직 실행해 확인하지 않았습니다.'}[status]
            if status == 'fail' and result.get('phase') == 'setup':
                message = '예시 준비 중 오류가 있어 확인을 완료하지 못했습니다.'
            if status == 'pass' and case.get('observation'):
                message = case['observation']
            if status == 'pass' and case.get('rejection_reason') and result.get('error') == case.get('expect_error_message'):
                message = case['rejection_reason']
            results.append(dict(id=result['id'], status=status, message=message,
                                method='not_run' if status == 'not_run' else result.get('method', 'sample'),
                                scope=result.get('scope', report['scope'])))
        document['verification'] = dict(engine=report['engine'], scope=report['scope'], executed_at=report['executed_at'],
                                        fingerprint_version='1', input_fingerprint=review_fingerprint(review), results=results)
    from .model_document import validate_model
    validate_model(document, allow_compatibility=allow_compatibility)
    return document
