# 복잡도에 맞춘 설계 검토

판단의 깊이와 기록 방법을 정한다. 화면은 [데이터 계약](review-contract.md), 쉬운 설명은 [설명 작성](report-writing.md)을 따른다. 새 문서는 model 1.1, 검토 기록은 modeling-review 1.1을 쓴다.

## 검토 깊이

| 수준 | 판단 기준 | 필요한 깊이 |
|---|---|---|
| simple | 분명한 식별·규칙, 외부 통합·기존 데이터 전환 없음 | 핵심 규칙·선택 이유·설계를 가르는 예를 짧게 작성 |
| standard | 여러 관계·상태·예외 또는 소유권 경계 | 중요한 대안, 관련 경계 상황, 미결 정책과 영향 |
| complex | 여러 원천 충돌, 금전·과거 재현, 격리·동시성, 기존 전환 | 선택 기준별 대안, 관련 규칙 누락, 쓰기부터 전환·복구까지 추적 |

테이블 수로 정하지 않는다. 위험이 집중된 부분을 깊게 보고 나머지는 짧게 쓴다. 모든 엔터티에 별도 위험·질문·대안을 채울 필요가 없다. role core는 업무 핵심, supporting은 근거/운영 지원, optional은 조건부 확장이다. optional에는 inclusion_condition을 명시하고 핵심 기능의 필수 구조로 포장하지 않는다.

## 대안 비교

실제로 가능한 선택지별 이점·대가를 `decisions[].choices:[{id,title,benefit,cost}]`에 작성하고 `selected_choice`로 선택한 안을 연결한다. `rationale`에는 선택 이유를 쓴다. 검토 기록의 alternatives.reviews는 decision_id, criteria(비교 기준 배열), revisit_when(재검토 조건)을 연결한다. choices와 기존 alternatives 문자열에 같은 내용을 중복 작성하지 않는다.

예: 상품마다 마켓 값을 직접 덮어쓰는 안과 원천별 값을 보존하고 변환하는 안은 구현 단순성·추적·정정 비용에서 비교할 수 있다. 선택하지 않은 안도 실제로 가능한 안이어야 한다. “복잡하므로 분리” 같은 한 문장을 대안 비교로 삼지 않는다. 단순 사례에 실질적 선택이 없으면 alternatives.not_needed_reason으로 충분하다.

## 업무 규칙의 누락 검토

하나의 규칙마다 ID·짧은 제목·관련 요구/모델/시나리오를 둔다. 같은 topic의 여러 규칙을 허용한다. 하나의 concurrency 항목에 중복 수신·역순·같은 시각 충돌·동시 갱신을 모두 묶지 않는다.

| topic | 빠뜨리기 쉬운 질문 |
|---|---|
| identity | 동일 대상·조직/계정/기간 안의 유일성 범위는? |
| ownership | 원본 관리 주체, 충돌 우선순위, 조직 경계는? |
| lifecycle | 확정·취소·정정·삭제 시 연결과 값은? |
| time | 발생·효력·수집 시점과 과거 재현은? |
| aggregation | 한 건의 의미, 중복·환불·단위·반올림은? |
| concurrency | 동시 요청·중복·역순 입력은? |
| integration | 외부 ID, 재수집·삭제·사양 변경·매핑 정정은? |
| access | 소유 정보와 실제 읽기·쓰기 권한의 차이는? |
| retention | 보존·익명화·삭제와 참조/이력의 충돌은? |

상태는 두 축이다.

- design_status: modeled(구조·시나리오에 반영), unmodeled(미반영), excluded(범위 제외), not_applicable(해당 없음).
- decision_status: proposed(작성자 제안), agreed(사용자 명시 합의), open(정책 미결).

modeled는 구현 확인이나 정책 합의가 아니다. modeled이면서 open일 수도 있다. 미반영·제외·해당 없음에는 reason을 남긴다. 미결/미반영/제외는 화면의 review_points에 연결한다. 정책 미결을 verification 종류의 미실행 항목으로 덮지 않는다. 위험 문장이 있다는 이유만으로 자동으로 남은 결정으로 만들지 않는다.

## 변경 영향 검토

`change_impact.baseline`: new/existing/unknown. `baseline_kind`: none/design_document/production_schema/unknown. 이전 모델 JSON만 읽었다면 design_document이며 실제 운영 스키마 확인을 뜻하지 않는다. 가능한 경우 기준 파일의 SHA-256도 남긴다.

`changes`에 설계상 실제 추가·변경·제외한 엔터티/열/관계를 ID별로 기록한다. before/after는 비교에 필요한 필드만 담고 현재 after가 모델과 일치해야 한다. 원본을 읽지 못한 전후 차이를 지어내지 않는다. 이것은 자동 DB diff·이관 실행 기록이 아니다.

영향은 다음 중 관련 영역을 확인한다. existing/unknown에서는 빠진 영역을 경고한다.

- writes/reads: 등록·수정·삭제·수집 주체, 조회·보고의 연결과 의미.
- contracts/existing_data: API·내보내기·소비자, 기존 중복·NULL·보완 범위.
- history: 과거 집계·정산·시점 재현과 재매핑의 영향.
- rollout/rollback: 공존·대조·전환 조건과 되돌릴 수 없는 값·중단/복구 조건.

원문은 ID가 있는 assumptions/limitations 또는 review_points 한 곳에 쓰고 items.note_ref로 연결한다. 현재 상태를 모르면 무영향으로 단정하지 않는다. 새 설계에는 존재하지 않는 이관 절차를 만들지 않고 중요한 정책이 바뀔 때 바뀌는 모델·샘플·조회를 남긴다.

## JSON 검토 기록

새 사례는 `review.extensions.modeling_review`에 `references/schemas/modeling-review-1.1.0.schema.json`을 따라 작성한다. 기존 1.0 기록과 기록 없는 파일은 호환된다. 업무 설명 원문을 확장 안에만 숨기지 않는다.

```json
{
  "version": "1.1.0",
  "complexity": {"level":"simple","reason":"단일 조직의 비품 분류이며 외부 통합과 이관이 없습니다."},
  "alternatives": {"reviews":[],"not_needed_reason":"식별 체계는 이미 합의된 제약입니다."},
  "rules": [{"id":"BR-01","title":"관리번호 중복 방지","topic":"identity","design_status":"modeled","decision_status":"proposed","requirements":["R-01"],"entities":["item"],"scenarios":["S-01"],"review_points":[]}],
  "change_impact": {"baseline":"new","baseline_kind":"none","baseline_note":"기존 DB를 대체하지 않는 새 논리 모델입니다.","changes":[],"items":[]}
}
```

이 조각의 참조 ID는 실제 문서에 있어야 한다. modeled 규칙은 연결된 시나리오가 해당 요구사항을 다뤄야 한다. change 항목은 id,target_type,대상 식별자,change,before,after,reason,requirements를 갖는다. target_type entity/column은 entity_id, column은 column_name, relationship은 relationship_id를 지정한다. added의 before와 removed의 after는 null이다. modified의 before는 비어 있지 않은 객체다.

Python과 뷰어가 계약·참조·샘플·결과 대응을 검사한다. 복합 사례의 미검토 topic, 기존 변경의 미검토 영향, 중복된 원문 등을 경고한다. 생성 기록의 design_review에 남고 validate_model.py가 출력한다. 문장 타당성·모든 업무 규칙·성능·동시성·이관을 자동으로 증명하지 않는다. 경고 0개를 완료 점수로 쓰지 않는다.
