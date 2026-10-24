#!/usr/bin/env python3
"""Build model JSON by default; --viewer and --format html are explicit maintenance/HTML modes."""
import argparse
import hashlib
import html
import json
import re
import platform
import tempfile
from model_integrity import value_key
from review_contract import (validate_document, renderer_release, load_json, canonical_digest, dependency_versions, ROOT)
from pathlib import Path


def esc(value):
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False)
    return html.escape(str(value))


def validate_review(data, allow_compatibility=False):
    validate_document(data, allow_compatibility=allow_compatibility)
    validate_references(data)


def validate_references(data, executable=True):
    for key in ('title', 'summary', 'requirements', 'entities', 'relationships', 'scenarios'):
        if key not in data:
            raise ValueError('Missing review field: ' + key)
    groups = ('requirements', 'entities', 'relationships', 'scenarios', 'sources', 'decisions', 'domains', 'review_points')
    all_ids = set()
    for group in groups:
        items = data.get(group, [])
        if not isinstance(items, list):
            raise ValueError(group + ' must be a list')
        for item in items:
            if not isinstance(item, dict):
                raise ValueError(group + ' items must be objects')
            ident = item.get('id', '')
            if not isinstance(ident, str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]*', ident) or ident in all_ids:
                raise ValueError('IDs must be unique safe identifiers: ' + str(ident))
            all_ids.add(ident)
    for group, fields in (('requirements', ('design', 'example')), ('review_points', ('summary',)), ('decisions', ('summary',))):
        for item in data.get(group, []):
            for field in fields:
                if field in item and (not isinstance(item[field], str) or not item[field].strip()):
                    raise ValueError(group + '.' + field + ' must be nonempty text: ' + item['id'])
    for item in data['requirements']:
        if 'design_points' in item and (not isinstance(item['design_points'], list) or not item['design_points'] or any(not isinstance(x, str) or not x.strip() for x in item['design_points'])):
            raise ValueError('Requirement design_points must be nonempty rule strings: ' + item['id'])
    entities = {e['id']: e for e in data['entities']}
    if 'initial_entity' in data and data['initial_entity'] not in entities:
        raise ValueError('Unknown initial_entity')
    if 'design_summary' in data and (not isinstance(data['design_summary'], list) or any(not isinstance(x, str) or not x.strip() for x in data['design_summary'])):
        raise ValueError('design_summary must contain nonempty text')
    if 'overview' in data:
        overview = data['overview']
        if not isinstance(overview, dict):
            raise ValueError('overview must be an object')
        for field in ('goal', 'connection', 'pending'):
            if not isinstance(overview.get(field), str) or not overview[field].strip():
                raise ValueError('overview requires nonempty ' + field)
        blocks = overview.get('structure')
        if 'structure' in overview and (not isinstance(blocks, list) or not 1 <= len(blocks) <= 4 or any(not isinstance(item, dict) or any(not isinstance(item.get(field), str) or not item[field].strip() for field in ('title', 'description')) for item in blocks)):
            raise ValueError('overview.structure requires 1 to 4 explained business groups')
        if 'diagram' not in overview and 'structure' not in overview:
            raise ValueError('overview requires an authored diagram or legacy structure')
        if 'diagram' in overview:
            diagram = overview['diagram']
            if not isinstance(diagram, dict) or not isinstance(diagram.get('nodes'), list) or not 1 <= len(diagram['nodes']) <= 8 or not isinstance(diagram.get('links'), list):
                raise ValueError('overview.diagram requires 1 to 8 nodes and explicit links')
            node_ids = set()
            for node in diagram['nodes']:
                if not isinstance(node, dict) or not isinstance(node.get('id'), str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]*', node['id']) or node['id'] in node_ids or not isinstance(node.get('title'), str) or not node['title'].strip():
                    raise ValueError('overview diagram nodes require unique IDs and business titles')
                node_ids.add(node['id'])
                if 'description' in node and (not isinstance(node['description'], str) or not node['description'].strip()):
                    raise ValueError('overview diagram descriptions must be nonempty text')
            for link in diagram['links']:
                if not isinstance(link, dict) or link.get('from') not in node_ids or link.get('to') not in node_ids or not isinstance(link.get('label'), str) or not link['label'].strip():
                    raise ValueError('overview diagram links require known nodes and business meaning')
        example = overview.get('example')
        if not isinstance(example, dict) or any(not isinstance(example.get(field), str) or not example[field].strip() for field in ('situation', 'outcome')):
            raise ValueError('overview.example requires situation and outcome')
        if 'scope' in overview and (not isinstance(overview['scope'], str) or not overview['scope'].strip()):
            raise ValueError('overview.scope must be nonempty text')
    for point in data.get('review_points', []):
        if point.get('kind') not in ('decision', 'scope', 'verification'):
            raise ValueError('Unknown review point kind: ' + point['id'])
        for field in ('title', 'question', 'recommendation', 'impact'):
            if not isinstance(point.get(field), str) or not point[field].strip():
                raise ValueError('Review point requires ' + field + ': ' + point['id'])
        if not isinstance(point.get('options'), list) or not point['options'] or any(not isinstance(x, str) or not x.strip() for x in point['options']):
            raise ValueError('Review point requires options: ' + point['id'])
        for field, group in (('entities', 'entities'), ('requirements', 'requirements'), ('scenario_ids', 'scenarios')):
            refs = point.get(field, [])
            if not isinstance(refs, list) or any(not isinstance(x, str) for x in refs) or set(refs) - {x['id'] for x in data[group]}:
                raise ValueError('Invalid review point references: ' + point['id'])
    if 'reading_guide' in data and not isinstance(data['reading_guide'], str):
        raise ValueError('reading_guide must be text')
    if 'process' in data:
        process = data['process']
        if not isinstance(process, dict) or not isinstance(process.get('skill'), str) or not process['skill'].strip():
            raise ValueError('process requires a skill name')
        steps = process.get('steps')
        if not isinstance(steps, list) or not steps or any(not isinstance(x, str) or not x.strip() for x in steps):
            raise ValueError('process requires nonempty actual steps')
        if 'scope' in process and not isinstance(process['scope'], str):
            raise ValueError('process.scope must be text')
    for domain in data.get('domains', []):
        if domain['id'] == 'all' or not isinstance(domain.get('name'), str) or not domain['name'].strip():
            raise ValueError('Domain requires a name and a non-reserved ID: ' + domain['id'])
        members = domain.get('entities')
        if not isinstance(members, list) or not members or any(not isinstance(x, str) for x in members):
            raise ValueError('Domain requires nonempty entity IDs: ' + domain['id'])
        if len(members) != len(set(members)) or set(members) - set(entities):
            raise ValueError('Invalid domain entity membership: ' + domain['id'])
    requirements = {r['id'] for r in data['requirements']}
    sources = {s['id'] for s in data.get('sources', [])}
    for entity in entities.values():
        for field in ('example', 'review_question', 'short_description'):
            if field in entity and not isinstance(entity[field], str):
                raise ValueError('Entity reader explanations must be text: ' + entity['id'])
        if not entity.get('grain') or not entity.get('columns'):
            raise ValueError('Entity requires grain and columns: ' + entity['id'])
        names = [c['name'] for c in entity['columns']]
        if 'sample_label_columns' in entity and (not isinstance(entity['sample_label_columns'], list) or any(not isinstance(x, str) for x in entity['sample_label_columns']) or set(entity['sample_label_columns']) - set(names)):
            raise ValueError('Invalid sample_label_columns: ' + entity['id'])
        if any('label' in c and (not isinstance(c['label'], str) or not c['label'].strip()) for c in entity['columns']):
            raise ValueError('Column label must be nonempty text: ' + entity['id'])
        if len(names) != len(set(names)):
            raise ValueError('Duplicate column: ' + entity['id'])
        for row in entity.get('rows', []):
            if not isinstance(row, dict) or set(row) - set(names):
                raise ValueError('Unknown sample column: ' + entity['id'])
    insight_refs = {
        'decision_ids': {x['id'] for x in data.get('decisions', [])},
        'source_ids': {x['id'] for x in data.get('sources', [])},
        'scenario_ids': {x['id'] for x in data.get('scenarios', [])},
    }
    for entity in entities.values():
        insight = entity.get('insights')
        if insight is None:
            continue
        if not isinstance(insight, dict):
            raise ValueError('Entity insights must be an object: ' + entity['id'])
        for key in (('purpose', 'tradeoff', 'risk') if data['schema_version']=='1.0.0' else tuple(k for k in ('purpose','tradeoff','risk') if k in insight)):
            if not isinstance(insight.get(key), str) or not insight[key].strip():
                raise ValueError('Entity insights require purpose/tradeoff/risk: ' + entity['id'])
        for key, known in insight_refs.items():
            refs = insight.get(key, [])
            if not isinstance(refs, list) or any(not isinstance(x, str) for x in refs) or set(refs) - known:
                raise ValueError('Invalid insight evidence reference: ' + entity['id'] + ':' + key)
    for relation in data['relationships']:
        if 'rationale' in relation and (not isinstance(relation['rationale'], str) or not relation['rationale'].strip()):
            raise ValueError('Relationship rationale must be nonempty text: ' + relation['id'])
        if 'explanation' in relation and not isinstance(relation['explanation'], str):
            raise ValueError('Relationship explanation must be text: ' + relation['id'])
        if 'foreign_key' in relation and not isinstance(relation['foreign_key'], bool):
            raise ValueError('relationship.foreign_key must be boolean: ' + relation['id'])
        for side in ('from', 'to'):
            end = relation[side]
            if end['entity'] not in entities:
                raise ValueError('Unknown relationship entity: ' + end['entity'])
            names = {c['name'] for c in entities[end['entity']]['columns']}
            if set(end.get('columns', [])) - names:
                raise ValueError('Unknown relationship column: ' + relation['id'])
            if not end.get('cardinality'):
                raise ValueError('Both endpoint cardinalities are required: ' + relation['id'])
        if relation.get('foreign_key') is True:
            left, right = relation['from'].get('columns', []), relation['to'].get('columns', [])
            if not left or len(left) != len(right):
                raise ValueError('Physical FK needs corresponding columns: ' + relation['id'])
    for group in ('entities', 'relationships', 'scenarios', 'decisions'):
        for item in data.get(group, []):
            if set(item.get('requirements', [])) - requirements:
                raise ValueError('Unknown requirement reference: ' + item['id'])
            if set(item.get('sources', [])) - sources:
                raise ValueError('Unknown source reference: ' + item['id'])
    for case in data['scenarios']:
        for field in ('observation', 'sample_note'):
            if field in case and (not isinstance(case[field], str) or not case[field].strip()):
                raise ValueError('Scenario ' + field + ' requires nonempty text: ' + case['id'])
        if 'entities' in case and (not isinstance(case['entities'], list) or any(not isinstance(x, str) for x in case['entities']) or len(set(case['entities'])) != len(case['entities'])):
            raise ValueError('Scenario entities must be unique entity IDs: ' + case['id'])
        refs = case.get('sample_refs', [])
        if not isinstance(refs, list):
            raise ValueError('Scenario sample_refs must be a list: ' + case['id'])
        for ref in refs:
            if not isinstance(ref, dict) or ref.get('entity') not in case.get('entities', []):
                raise ValueError('Sample reference must name a scenario entity: ' + case['id'])
            entity = entities[ref['entity']]
            primary = {c['name'] for c in entity['columns'] if re.search(r'\bPK\b', c.get('key', '')) or re.search(r'PRIMARY\s+KEY', c.get('type', ''), re.I)}
            key = ref.get('key')
            if not primary or not isinstance(key, dict) or set(key) != primary or any(value is None or isinstance(value, (dict, list)) for value in key.values()):
                raise ValueError('Sample reference requires the full primary key: ' + case['id'])
            if sum(all(name in row and value_key(row[name]) == value_key(value) for name, value in key.items()) for row in entity.get('rows', [])) != 1:
                raise ValueError('Sample reference must match exactly one baseline row: ' + case['id'])
        for field in ('expect_error_message', 'rejection_reason'):
            if field in case and (not isinstance(case[field], str) or not case[field].strip() or not case.get('expect_error')):
                raise ValueError(field + ' requires an expected error: ' + case['id'])
        if case.get('rejection_reason') and not case.get('expect_error_message'):
            raise ValueError('Authored rejection reason requires exact error evidence: ' + case['id'])
        if 'result_key' in case:
            keys = case['result_key']
            if not isinstance(keys, list) or len(set(keys)) != len(keys) or any(type(x) is not int or x < 0 or x >= len(case.get('result_columns', [])) for x in keys):
                raise ValueError('Invalid result_key: ' + case['id'])
        if 'explanation' in case:
            note = case['explanation']
            if not isinstance(note, dict) or any(not isinstance(note.get(k), str) or not note[k].strip()
                    for k in ('situation', 'expected_behavior', 'why_it_matters')):
                raise ValueError('Scenario explanation needs situation, expected_behavior and why_it_matters: ' + case['id'])
        if 'result_columns' in case:
            labels = case['result_columns']
            if not isinstance(labels, list) or not labels or any(not isinstance(x, str) or not x.strip() for x in labels):
                raise ValueError('Scenario result_columns must be nonempty labels: ' + case['id'])
            rows = case.get('expected', [])
            if not isinstance(rows, list) or any(not isinstance(row, list) or len(row) != len(labels) for row in rows):
                raise ValueError('Scenario result_columns must match expected rows: ' + case['id'])
        if set(case.get('entities', [])) - set(entities):
            raise ValueError('Unknown scenario entity: ' + case['id'])
        if not case.get('requirements'):
            raise ValueError('Scenario must trace a requirement: ' + case['id'])
        if executable and 'expected' not in case and not case.get('expect_error'):
            raise ValueError('Scenario needs expected result: ' + case['id'])
        if 'expected' in case and case.get('expect_error'):
            raise ValueError('Scenario cannot expect both rows and an error: ' + case['id'])


def public_payload(data, report=None, *, allow_compatibility=False, input_sha256=None, verification_sha256=None):
    validate_review(data, allow_compatibility=allow_compatibility)
    release = renderer_release()
    build_metadata = dict(schema_version=data["schema_version"], renderer_version=release["renderer_version"], review_profile=data["review_profile"], input_sha256=input_sha256 or canonical_digest(data), verification_sha256=verification_sha256, renderer_release_sha256=hashlib.sha256((ROOT / "renderer-release.json").read_bytes()).hexdigest())
    public_data = {key: value for key, value in data.items() if key not in ('sqlite', 'scenarios')}
    public_data['scenarios'] = [{key: value for key, value in case.items()
        if key in ('id', 'title', 'requirements', 'entities', 'explanation', 'sample_refs', 'sample_note')} for case in data['scenarios']]
    public_report = None
    if report is not None:
        cases = {case['id']: case for case in data['scenarios']}
        checks = []
        for result in report['results']:
            status = result['status']
            message = {'pass': '예시에서 예상한 동작을 확인했습니다.',
                       'fail': '예상과 다른 결과가 나왔습니다. 설계와 확인 조건을 다시 검토해야 합니다.',
                       'not_run': '아직 실행해 확인하지 않았습니다.'}[status]
            case = cases[result['id']]
            if status == 'fail' and result.get('phase') == 'setup':
                message = '예시 준비 중 오류가 있어 확인을 완료하지 못했습니다.'
            if status == 'pass' and case.get('observation'):
                message = case['observation']
            if status == 'pass' and case.get('rejection_reason') and result.get('error') == case.get('expect_error_message'):
                message = case['rejection_reason']
            checks.append(dict(id=result['id'], status=status, message=message))
        public_report = {key: report[key] for key in ('engine', 'scope', 'executed_at')}
        public_report['results'] = checks
    return dict(review=public_data, verification=public_report, build_metadata=build_metadata)


def render(data, report=None, **options):
    payload = public_payload(data, report, **options)
    return render_html(payload['review'], payload['verification'], payload['build_metadata'], data['title'])


def viewer_metadata(release):
    # Explicitly tested display-compatible releases. Do not infer compatibility from semver.
    supported = load_json(ROOT / 'assets/share-compatibility.json')
    supported[release['renderer_version']] = hashlib.sha256((ROOT / 'renderer-release.json').read_bytes()).hexdigest()
    return dict(schema_version=release['schema_version'], share_format_version='1.0.0',
                renderer_version=release['renderer_version'], compatible_releases=supported)


def render_viewer():
    """Generate a reusable viewer without any case, sample, input hash or execution result."""
    renderer_release()
    return render_html(None, None, None, '데이터 모델링 뷰어')


def render_html(review, verification, build_metadata, title):
    release = renderer_release()
    assets = ROOT / 'assets'
    notices = {p.name: p.read_text(encoding='utf-8') for p in (assets / 'vendor').glob('*.txt')}
    payload = json.dumps(dict(review=review, verification=verification, third_party_notices=notices,
                              build_metadata=build_metadata, viewer_metadata=viewer_metadata(release)), ensure_ascii=False)
    payload = payload.replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    css = (assets / 'review.css').read_text(encoding='utf-8')
    scripts = [(assets / name).read_text(encoding='utf-8') for name in
               ('vendor/viz-global.js', 'vendor/share-validator.js', 'model-integrity.js', 'review-transfer.js', 'review.js')]
    return ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>' + esc(title) + '</title><style>' + css + '</style></head>'
            '<body><main id="app"></main><noscript>탭·ERD·상세 내용을 사용하려면 JavaScript를 활성화하세요.</noscript>'
            '<script type="application/json" id="review-data">' + payload + '</script>'
            + ''.join('<script>' + script + '</script>' for script in scripts) + '</body></html>')


def write_outputs(destination, output, receipt):
    destination.parent.mkdir(parents=True, exist_ok=True)
    for target, content in [(destination, output), (destination.with_suffix('.build.json'), json.dumps(receipt, ensure_ascii=False, indent=2)+'\n')]:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=target.parent, delete=False) as handle:
            handle.write(content)
            temporary = Path(handle.name)
        temporary.replace(target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path, nargs='?')
    parser.add_argument('--viewer', action='store_true', help='Generate a reusable empty viewer; no review input is read or embedded')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--verification', type=Path)
    parser.add_argument('--format', choices=('json','html'), help='Default: json. Independent HTML requires explicit --format html')
    parser.add_argument('--allow-compatibility', action='store_true', help='Explicit legacy/test rendering; never a new standard report')
    parser.add_argument('--clear-verification',action='store_true',help='Explicitly clear observations in authored model JSON')
    args = parser.parse_args()
    if args.viewer and (args.input or args.verification or args.allow_compatibility or args.format or args.clear_verification):
        parser.error('--viewer cannot be combined with an input, --verification or --allow-compatibility')
    if not args.viewer and args.input is None:
        parser.error('Provide a review input, or use --viewer to generate a data-free viewer')
    if args.format == 'html' and args.clear_verification:parser.error('--clear-verification is JSON-only')
    if args.format == 'html' and args.output.suffix.lower() not in ('.html', '.htm'):
        parser.error('--format html requires an .html output path')
    try:
        if not args.viewer and args.format != 'html':
            from build_model import build_to_file
            print(str(build_to_file(args.input,args.output,args.verification,args.allow_compatibility,args.clear_verification)))
            return
        if args.viewer:
            output = render_viewer()
            release = renderer_release()
            receipt = dict(kind='empty-viewer', schema_version=release['schema_version'],
                           renderer_version=release['renderer_version'], share_format_version='1.0.0',
                           compatible_releases=viewer_metadata(release)['compatible_releases'],
                           input_sha256=None, verification_sha256=None,
                           renderer_release_sha256=hashlib.sha256((ROOT/'renderer-release.json').read_bytes()).hexdigest(),
                           output_sha256=hashlib.sha256(output.encode('utf-8')).hexdigest(),
                           python_version=platform.python_version(), dependencies=dependency_versions())
            write_outputs(args.output, output, receipt)
            print(str(args.output.resolve()))
            return
        raw = args.input.read_bytes()
        data = load_json(args.input)
        validate_review(data, allow_compatibility=args.allow_compatibility)
        report = load_json(args.verification) if args.verification else None
        if report is not None:
            if not isinstance(report, dict) or not isinstance(report.get('results'), list):
                raise ValueError('Verification report requires a results list')
            if any(not isinstance(report.get(key), str) or not report[key].strip()
                   for key in ('engine', 'scope', 'executed_at')):
                raise ValueError('Verification report requires engine, scope and executed_at')
            if report.get('input_sha256') != hashlib.sha256(raw).hexdigest():
                raise ValueError('Verification report is stale or belongs to another review input')
            ids = [r['id'] for r in report['results']]
            if len(set(ids)) != len(ids) or set(ids) != {s['id'] for s in data['scenarios']}:
                raise ValueError('Verification scenario IDs do not match review')
            if any(r.get('status') not in ('pass', 'fail', 'not_run') for r in report['results']):
                raise ValueError('Invalid verification status')
        args.output.parent.mkdir(parents=True, exist_ok=True)
        input_sha = hashlib.sha256(raw).hexdigest()
        verification_sha = hashlib.sha256(args.verification.read_bytes()).hexdigest() if args.verification else None
        output = render(data, report, allow_compatibility=args.allow_compatibility, input_sha256=input_sha, verification_sha256=verification_sha)
        release = renderer_release()
        receipt = dict(kind='case-html', schema_version=data['schema_version'], renderer_version=release['renderer_version'], review_profile=data['review_profile'], input_sha256=input_sha, verification_sha256=verification_sha, renderer_release_sha256=hashlib.sha256((ROOT/'renderer-release.json').read_bytes()).hexdigest(), output_sha256=hashlib.sha256(output.encode('utf-8')).hexdigest(), python_version=platform.python_version(), dependencies=dependency_versions())
        write_outputs(args.output, output, receipt)
        print(str(args.output.resolve()))
    except (ValueError, KeyError, TypeError) as exc:
        parser.error(str(exc))


if __name__ == '__main__':
    main()
