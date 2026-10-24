#!/usr/bin/env python3
"""Recheck synthetic business examples. Never claim API/DB/concurrency verification."""
import argparse
import copy
from datetime import datetime
import json
from pathlib import Path
import sys
from collections import defaultdict
REPO=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(REPO/'skills/data-modeling/scripts'))
from lib.contract import load_json
from lib.validation import validate_document
from lib.fingerprint import observation_fingerprint


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--record-observations',action='store_true')
    args=parser.parse_args();checks=[]
    def require(value,message):
        if not value:raise AssertionError(message)
    for name in ['inventory','booking-change','openmarket']:
        path=REPO/'examples'/f'{name}.model.json';doc=load_json(path)
        if args.record_observations:doc['observations']=[]
        validate_document(doc)
        rows=doc['samples']['datasets'][0]['rows'];results=[]
        def check(sid,title,fn,method='sample'):
            try:message=fn();status='pass'
            except Exception as exc:message=str(exc);status='fail'
            observation=dict(scenario_id=sid,status=status,method=method,scope='합성 데이터의 Python 대조만 수행했습니다. 실제 DB·API·동시 처리는 확인하지 않았습니다.',observed_at=datetime.now().astimezone().isoformat(timespec='seconds'),message=message,input_fingerprint=observation_fingerprint(doc,sid,method))
            results.append(observation);checks.append(dict(case=name,scenario_id=sid,title=title,status=status,message=message))
        if name=='inventory':
            def rename():
                changed=copy.deepcopy(rows);changed['category'][0]['name']='새 분류명'
                item=next(r for r in changed['item'] if r['asset_code']=='IT-001')
                category=next(r for r in changed['category'] if r['id']==item['category_id'])
                require(item['category_id']=='C1' and category['name']=='새 분류명','분류 연결 또는 새 이름이 다릅니다.')
                return 'IT-001은 C1 연결을 유지하면서 변경된 분류 이름을 읽습니다. 이름 변경의 샘플 대조이며 DB 갱신 실행은 아닙니다.'
            check('S-01','분류 이름 변경 후 연결 유지',rename)
            def renamed_dataset():
                dataset=next(d for d in doc['samples']['datasets'] if d['id']=='DS-RENAMED')
                item=next(r for r in dataset['rows']['item'] if r['asset_code']=='IT-001')
                category=next(r for r in dataset['rows']['category'] if r['id']==item['category_id'])
                require(item['category_id']=='C1' and category['name']=='정보기기','변경 후 데이터셋이 기대와 다릅니다.')
                require(rows['category'][0]['name']=='컴퓨터','기본 데이터셋까지 변경됐습니다.')
                return '변경 후 예시에서는 C1 이름이 정보기기이고, 기본 예시의 컴퓨터 이름은 그대로입니다.'
            check('S-RENAMED','독립 데이터셋 선택',renamed_dataset)
        if name=='booking-change':
            def rooms():
                tuples=[(r['campus_id'],r['code']) for r in rows['room']]
                require(('C1','101') in tuples and ('C2','101') in tuples and len(tuples)==len(set(tuples)),'사업장별 방 번호가 다릅니다.')
                return 'C1·101과 C2·101은 다른 회의실이고, 같은 사업장·번호 조합은 중복되지 않습니다.'
            check('S-01','사업장별 방 식별',rooms)
        if name=='openmarket':
            orders={o['id']:o for o in rows['order_line']};mappings={m['id']:m for m in rows['mapping']};skus={s['id']:s for s in rows['sku']}
            totals=defaultdict(int);unassigned=0
            for event in rows['ledger']:
                if not(event['metric_version']=='METRIC-v1' and event['currency']=='KRW' and '2026-10-01'<=event['event_date']<'2026-11-01'):continue
                order=orders[event['order_id']];mapping=mappings.get(order['mapping_id'])
                if not mapping:unassigned+=event['amount'];continue
                sku=skus[mapping['sku_id']]
                if sku['product_id']=='A':totals[order['market']]+=event['amount']
            expected={'CP':10000,'GM':18000,'NV':12000,'ST':15000}
            def total():
                require(sum(totals.values())==55000,'상품 A의 합계가 55,000원이 아닙니다.')
                return '상품 A의 옵션에 연결된 결제·환불 기록을 같은 기준으로 합산하면 55,000원입니다.'
            def markets():
                require(dict(totals)==expected,'마켓별 금액이 기대와 다릅니다: '+str(dict(totals)))
                return '쿠팡 10,000원 · G마켓 18,000원 · 네이버 12,000원 · 11번가 15,000원입니다.'
            def reconcile():
                require(sum(expected.values())==sum(totals.values())==55000,'마켓별·통합 합계가 다릅니다.')
                return '네 마켓 금액의 합계는 상품 A의 통합 금액 55,000원과 같습니다.'
            def unmatched():
                require(unassigned==5000 and sum(totals.values())+unassigned==60000,'미귀속 포함 대조가 다릅니다.')
                return '상품 A에 귀속된 55,000원과 미귀속 5,000원을 더하면 전체 60,000원입니다.'
            check('S-01','상품별 통합 매출',total);check('S-02','마켓별 매출',markets);check('S-03','마켓 합계 대조',reconcile);check('S-04','미귀속 포함 전체 대조',unmatched)
        if args.record_observations:
            if any(r['status']=='fail' for r in results):raise ValueError('Do not publish failed example observations without review')
            doc['observations']=results;validate_document(doc);path.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
    report=dict(scope='합성 샘플 대조; 실제 운영 검증 아님',passed=sum(c['status']=='pass' for c in checks),failed=sum(c['status']=='fail' for c in checks),checks=checks)
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['passed','failed']}))
    if report['failed']:raise SystemExit(1)


if __name__=='__main__':main()
