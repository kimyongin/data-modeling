#!/usr/bin/env python3
"""Audit the packaged JSON-first instructions, examples and default command guidance."""
import argparse,json,re
from pathlib import Path
from review_contract import ROOT


def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);args=p.parse_args();checks=[]
 def check(name,condition):checks.append(dict(name=name,status='pass' if condition else 'fail'))
 skill=(ROOT/'SKILL.md').read_text();workflow=(ROOT/'references/rendering-workflow.md').read_text();contract=(ROOT/'references/review-contract.md').read_text();evaluation=(ROOT/'references/evaluation-cases.md').read_text()
 check('entry skill directs case JSON to the existing viewer',all(x in skill for x in ['<사례명>.model.json','validate_review.py','기존 `dist/model-viewer.html`','사례마다 HTML을 만들거나 뷰어를 재생성하지 않는다']))
 check('direct authoring example is the default complete example', 'example-model.json' in skill and json.loads((ROOT/'references/example-model.json').read_text())['format']=='data-modeling-model')
 check('execution fields are scoped to optional internal input', 'SQL·검증 전용 탭은 기본 산출물에 추가하지 않는다' in skill and '## 선택적인 내부 실행 검증' in contract and '## 기본 모델 JSON의 review 필드' in contract)
 check('evaluation requests models as JSON rather than case HTML',all(x not in evaluation for x in ['담은 HTML로 검토','모델과 HTML 예시','패턴, HTML 생성']))
 check('workflow states HTML requires an explicit option','HTML은 반드시 --format html을 명시' in workflow and 'HTML 생성은 필요 없다' in contract)
 violations=[]
 for file in [ROOT/'SKILL.md',*sorted((ROOT/'references').glob('*.md'))]:
  for n,line in enumerate(file.read_text().splitlines(),1):
   if re.search(r'^\s*(?:\.venv/bin/python|python\S*)\s+.*scripts/render_review\.py\b.*--output\s+\S*\.html\b',line) and '--format html' not in line and '--viewer' not in line:violations.append(str(file.relative_to(ROOT))+':'+str(n))
 check('no executable guide command silently creates case HTML',not violations)
 check('core documentation no longer selects HTML from an output suffix','.html 출력 또는 --format html' not in contract and '이전 .html 출력 호환 경로' not in workflow)
 example=json.loads((ROOT/'references/example-model.json').read_text());check('ready-to-edit example needs neither renderer pins nor execution fields','renderer_version' not in example['review'] and 'checksum' not in example and 'sqlite' not in example['review'] and all('expected' not in s and 'query' not in s for s in example['review']['scenarios']))
 check('UI guidance is routed to references', (ROOT/'references/report-writing.md').exists() and '1366×768' not in skill and 'report-writing.md' in skill and 'review-contract.md' in skill)
 check('design reasoning is part of the normal JSON workflow', 'extensions.modeling_review' in skill and 'design-review.md' in skill and (ROOT/'schemas/modeling-review-1.1.0.schema.json').exists())
 check('content-bound results and same browser checks documented',all(x in skill for x in ['--clear-verification','내용 지문','뷰어도 같은 검사']) and (ROOT/'references/result-integrity.md').exists())
 check('new version and legacy policy are explicit','model-1.1.0.schema.json' in skill and '이전 1.0 파일' in skill)
 report=dict(passed=sum(c['status']=='pass' for c in checks),failed=sum(c['status']=='fail' for c in checks),checks=checks,legacy_html_command_violations=violations);args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:report[k] for k in ('passed','failed')}))
 if report['failed']:raise SystemExit(1)


if __name__=='__main__':main()
