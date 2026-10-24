# 설계 대안·규칙 누락·변경 영향

## 복잡도와 깊이

`document.complexity`에 simple/standard/complex와 이유를 쓴다. 엔터티 개수 대신 금전·시간·조직 격리·동시성·원천 충돌·과거 재현·운영 전환의 영향을 기준으로 정한다. 단순한 목록에 가짜 대안과 모든 위험을 강요하지 않는다. 복합 사례에서도 중요한 선택과 예외만 깊게 설명한다.

## 설계 대안

`decisions` 하나에 choices(실제로 가능한 안별 이점·대가), criteria, selected_choice, rationale, revisit_when을 모은다. status는 proposed/agreed/open이다. 동의한 근거 없이 agreed를 쓰지 않는다. 별도 대안 색인이나 다른 필드에 같은 원문을 반복하지 않는다. 단순 사례에 의미 있는 선택이 없으면 decisions를 비워도 된다. 판단의 유무와 검토 완전성은 별개다.

## 업무 규칙의 누락 검토

`rules` 한 항목에 지킬 조건 하나를 작성한다. statement가 원문이고 title은 짧은 이름이다. 같은 topic에 여러 규칙을 둘 수 있다.

| topic | 확인할 질문 |
|---|---|
| identity | 같은 대상의 기준과 조직·계정·기간 안의 유일성 범위는? |
| ownership | 관리 주체·갱신 우선권·조직 경계는? |
| lifecycle | 확정·취소·삭제·정정 시 연결과 값은? |
| time | 발생·수집·효력 시각과 과거 재현은? |
| aggregation | 한 건의 의미, 중복·환불·통화·단위·반올림은? |
| concurrency | 동시 요청·재수신·역순·상충 변경은? |
| integration | 외부 ID, 누락·삭제·사양 변경·매핑 정정은? |
| access | 데이터 소유와 실제 읽기·쓰기 권한의 차이는? |
| retention | 보존·익명화·삭제와 참조·이력의 충돌은? |

두 상태를 구별한다.

- design_status: modeled/unmodeled/excluded/not_applicable.
- agreement_status: proposed/agreed/open.

modeled는 관련 요구·모델·시나리오에 반영했다는 뜻이며 실제 구현 확인이나 사용자 합의를 뜻하지 않는다. modeled 규칙은 요구를 다루는 scenario_ids에 연결한다. 미반영·제외·해당 없음에는 reason을 쓴다. 미결·미반영·제외에는 issue_ids를 연결하고, 정책 미결을 verification 종류의 쟁점으로 덮지 않는다. 위험 설명만으로 쟁점의 질문·선택지·영향을 대신하지 않는다.

## 변경 영향 검토

`change_impact.baseline.kind`는 new/design_document/production_schema/unknown이다. 이전 모델 JSON만 읽었다면 design_document이며 실제 운영 DB 확인을 뜻하지 않는다. description에 기준과 한계를 기록하고 가능하면 sha256을 남긴다.

changes는 entity/attribute/relationship별 added/modified/removed를 기록한다. 대상 ID, before/after, reason, requirement_ids를 작성한다. after는 현재 정의와 일치해야 한다. added.before와 removed.after는 null이다. 미확인 전후 차이를 지어내지 않는다.

before/after는 업무 데이터의 과거 값이 아니라 변경 전/후의 설계 값이다. 최신 정의는 model에 두고 변경 기록을 최신 설명 대신 사용하지 않는다. 현재 문서가 제공하는 기록은 baseline과 이번 설계의 비교이며 여러 버전의 누적 이력 저장소가 아니다. 대상 종류는 target_type이 기준이며 다른 종류의 ID를 표시 대상으로 대신 쓰지 않는다.

before/after는 확인한 필드만 기록한 부분 비교일 수 있다. 생략한 필드는 미기록이며 null·빈 문자열·false·0과 다르다. 한쪽에서 생략한 필드를 추가·삭제로 해석하지 않는다. 실제 DB 전체 비교와 문서에 적은 변경 항목의 범위를 구분한다. 제외 대상은 현재 모델에 없어도 이전 name/title/label 등 확인 가능한 식별 설명을 남긴다.

areas는 writes/reads/contracts/existing_data/history/rollout/rollback의 관련 영향을 기록한다. note_id로 assumptions/limitations/issues의 원문에 연결한다. unknown은 issue_ids, affected는 구체 entity_ids를 필요로 한다. 기준이 unknown일 때 unaffected로 단정하지 않는다. 새 설계에는 존재하지 않는 이관을 만들지 않고 중요한 정책이 달라질 때 무엇이 바뀌는지 설명한다.

검사기는 연결·대응을 확인하고 복합 사례의 빠진 topic, 기존 변경의 빠진 영향 영역을 경고한다. 경고 0개를 업무 규칙의 완전성이나 배포 준비 점수로 사용하지 않는다.
