# 모델 JSON 2.0 데이터 계약

[단일 JSON Schema](schemas/model-2.0.0.schema.json)가 필드·필수성·허용 값을 정의한다. Python과 뷰어는 이 스키마와 동일한 행동 사례로 검사한다. 문서 버전은 루트 `version` 하나이며 생성기·뷰어 버전은 업무 JSON에 넣지 않는다.

## 원문을 둘 위치

| 영역 | 역할 |
|---|---|
| document | 제목·목표·범위·모델 수준·복잡도·업무 연결 그림·실제 제작 과정 |
| requirements | 사용자가 원하는 동작. id/title/description와 선택적인 업무 예 |
| rules | 지킬 조건의 원문과 topic, 설계 반영·합의 상태, 관련 요구/모델/시나리오/쟁점 |
| decisions | 현실적인 choices의 이점·대가, 판단 기준, 선택안·이유, 재검토 조건과 제안/합의/미결 상태 |
| issues | 아직 정할 정책, 범위 제외, 실행 미확인의 질문·선택지·추천·영향 |
| model | 엔터티·속성·관계·업무 영역의 정의 |
| samples | 독립 데이터셋과 이를 선택하는 확인 시나리오 |
| observations | 실제 확인한 결과만 기록. 미기록은 미확인 |
| sources | 주장·자료 위치·버전/확인일·한계와 선택적 원문 URL |
| assumptions / limitations | ID가 있는 공통 가정·제한. title/description와 선택적 impact |
| change_impact | 비교 기준, 실제 대상별 전후 변경, 쓰기·조회·계약·기존 자료·과거·전환·복구 영향 |

스펙의 설계안은 rules와 decisions에서 조합한다. 요구사항에 같은 설계 문장을 복사하지 않는다. 모든 문서 내 항목 ID는 영문자로 시작하는 영문·숫자·밑줄·하이픈이며 전체에서 유일하다. 속성 이름과 선택지 ID는 각 엔터티·결정 안에서 유일하다. 개요 그림의 노드 ID는 그림 안에서 유일하다.

참조 배열은 `requirement_ids/entity_ids/source_ids/decision_ids/scenario_ids/issue_ids`처럼 대상이 드러나는 이름을 쓴다. 실제 대상을 가리켜야 한다. 한 방향으로 저장한 참조의 역방향 목록은 뷰어가 계산한다. 추적할 수 없는 연결을 생성기가 지어내지 않는다.

## 모델과 명시적 키

엔터티는 id/name/description/grain/role/attributes/primary_key/unique_keys를 갖는다. role은 core/supporting/optional이며 optional에는 condition이 필요하다. attribute는 name/label/type/required/description이다. type은 작성한 논리 또는 물리 저장 형식이며 검사기가 특정 DB의 타입 변환을 재현하지 않는다.

`primary_key: ["organization_id", "id"]`, `unique_keys: [["organization_id", "code"]]`처럼 열 조합을 명시한다. PK/FK 문자열이나 타입 설명에서 키를 추측하지 않는다. 추가 constraints와 indexes는 설명 문자열 배열이다.

관계는 from/to의 entity_id/attributes/cardinality, foreign_key, description(연결 이유), rule(지킬 조건), enforcement(보장 위치)을 정의한다. physical FK는 양끝 속성의 수·순서를 맞추고 대상 PK 또는 유일 조합을 선언한다. 논리 관계는 foreign_key:false이며 DB FK처럼 검사하지 않는다. domains는 name/description/entity_ids로 업무 범위를 정의한다.

## 데이터셋과 시나리오

데이터셋은 id/title/description과 `rows: {"entity_id": [{"attribute": "value"}]}`를 갖는다. 서로 다른 데이터셋의 같은 PK는 다른 상황의 예시다. 각 데이터셋의 PK·필수 값·유일 조합·물리 FK를 독립적으로 검사한다. 참조할 부모 행도 같은 데이터셋에 포함한다.

시나리오는 요구/모델 ID, dataset_id, situation/expected_behavior/why_it_matters와 sample_refs를 갖는다. sample_refs는 entity_id와 전체 PK를 담은 key이며 해당 데이터셋의 정확히 한 행에 대응한다. 기본 샘플로 실제 예약 거절·동시성·API 동작을 확인했다고 쓰지 않는다.

## 결정·규칙·변경

[설계 검토](design-review.md)를 따른다. 결정마다 선택지를 한 곳에 작성한다. open 결정에는 선택안을 생략할 수 있다. 선택한 안이 있어도 proposed는 사용자 합의가 아니다. 정책 쟁점과 실행 미확인을 구별한다.

[결과 계약](result-integrity.md)에 따라 observations는 현재 대상의 내용 지문과 대응한다. 문서는 코드나 SQL을 실행하지 않는다. 공통 뷰어는 문서를 표시하며 가져오기 자체는 재검증·정책 합의가 아니다.
