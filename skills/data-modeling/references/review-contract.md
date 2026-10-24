# 모델 JSON과 공통 뷰어 계약

새 사례는 [모델 JSON 작성 안내](model-json.md)의 `references/schemas/model-1.1.0.schema.json`을 따라 직접 작성하고 공통 뷰어에서 연다. 기본 산출물은 `.model.json`이며 HTML 생성은 필요 없다. [직접 작성 예제](example-model.json)에 체크섬·렌더러 핀·SQL이 없는 완전한 문서가 있다.

기본 문서는 format=data-modeling-model, format_version=1.1.0, review를 갖는다. verification과 build_metadata는 선택이며 없으면 미실행·생성 정보 없음으로 표시한다. 아래 표는 review 안의 업무 필드다. 직접 작성/스킬 생성/파일 공유 모두 같은 계약을 따른다. 실행 검증용 중간 입력의 차이는 별도 절에서만 설명한다.

## 기본 모델 JSON의 review 필드

| 필드 | 형식·의미 |
|---|---|
| schema_version, review_profile | 필수. schema_version은 1.1.0, 새 설계의 review_profile은 standard. 기본 모델에는 renderer_version·체크섬·실행 코드가 필요 없음 |
| title, summary | 제목, 설계 목적 문자열. 필수 |
| initial_entity | 선택. 첫 화면에서 설명·샘플을 보여줄 엔터티 ID. ERD는 전체 맞춤을 유지 |
| design_summary | 선택. 실제 설계가 뒷받침하는 핵심 선택을 설명하는 문자열 배열 |
| review_points | standard 필수(해당 없음은 빈 배열), compatibility 선택. 아래 검토 쟁점 형식. 전역 ID 중복 금지 |
| reading_guide | 선택. 이 업무 사례에서 먼저 볼 영역·정보와 확인할 질문을 쉬운 문장으로 작성 |
| process | standard 필수, compatibility 선택. `{skill, steps:[실제 수행한 절차 문자열...], scope?}`. steps는 비어 있지 않아야 함. 누락 시 기본 절차와 실제 수행 내역 미기재 경고를 표시하며 조사·실행을 했다고 단정하지 않음 |
| level, review_status, scope | 모델 수준, 합의 상태(기본 초안), 범위 문자열 |
| requirements | `{id, text, ...}` 배열. 필수 |
| sources | `{id, title, url 또는 location, kind, checked_at, version, claim, limitation}` 배열. kind는 사실/해석/미확인/충돌 등을 표시 |
| decisions | `{id, title, rationale, choices?, selected_choice?, requirements:[], sources:[]}`; 선택지별 이점·대가와 선택한 안. 기존 alternatives 문자열은 호환용 배열 |
| assumptions, limitations | 설명 문자열 또는 `{id, title, detail, impact, ...}` 배열 |
| domains | 선택. `{id, name, description?, entities:[엔터티ID...]}` 배열. 업무별 검토 대상 집합. 여러 영역에 중복 소속 가능. `all`은 전체 보기용 예약 ID이므로 사용하지 않음 |
| entities | 엔터티 배열. 필수. 각 항목 `{id, name, grain, description, group?, short_description?, example?, review_question?, sample_label_columns?, insights?, requirements:[], sources:[], columns:[], rows:[]}` |
| entities[].columns | `{name, label?, type, key, nullable, description}`. standard에서는 name·label·type·key·nullable·description 필수. key 예: PK, FK, UQ, PK/FK. label은 업무용 이름이며, 영문 name과 원 타입은 그대로 보존. 복합 키·범위·인덱스·이력 규칙은 description/decisions로 보충 |
| entities[].rows | 컬럼명을 키로 하는 샘플 행 객체 배열. 뷰어에 표시할 샘플이며 별도 실행 검증을 한다면 같은 행을 사용 |
| relationships | 관계 배열. 필수(없으면 빈 배열). `{id, name, from, to, foreign_key?:boolean, explanation?, rationale?, title?, rule, enforcement, requirements:[], sources:[]}` |
| 관계 양끝 from/to | `{entity:엔터티ID, columns:[필드명], cardinality:"0..N"}`. cardinality는 **해당 끝에 위치한 대상 수**. 자식→부모 관계라면 from에 0..N, to에 1 등이 온다. columns 순서는 복합 참조 필드 대응 순서. FK 아닌 논리 관계는 `foreign_key:false`와 enforcement에 명시. 물리 FK는 `foreign_key:true`로 지정하고 양끝 열을 같은 수·대응 순서로 작성. 명시적인 compatibility 입력에서만 enforcement/rule에 FK·FOREIGN KEY·외래키가 명시된 관계만 FK 열 보완에 사용하며 모든 논리 연결을 FK로 만들지 않음 |
| scenarios | `{id, title, requirements:[], entities:[], explanation:{situation,expected_behavior,why_it_matters}, sample_refs?, sample_note?}` 배열. SQL·expected·실행 결과 없이 작성 가능 |

엔터티·요구사항·관계·시나리오·근거·결정·업무 영역 ID는 전체에서 중복되지 않게 하고 영문자로 시작해 영문·숫자·밑줄·하이픈으로 작성한다. 예: `R-01`, `E-01`, `project`, `REL-01`, `S-01`. 연결 필드의 ID는 실제 존재해야 한다.

## 1.1의 역할·유일성·결과 대응

entities[].role은 core/supporting/optional이며 optional에는 inclusion_condition을 작성한다. unique_keys는 실제 유일성 범위의 열 조합 배열이다. key의 UQ 표시만으로 단일 열 유일성을 추측하지 않는다. 모든 샘플의 PK·필수 값·명시한 조합·물리 FK를 검사한다.

verification은 선택이다. 기록할 때 method·scope와 review 내용 지문을 포함한다. 입력 변경 후 남은 결과는 Python과 브라우저 모두 거부한다. 이전 1.0 결과는 입력 대응 미확인으로 표시하고 원본을 유지한다. 자세한 [결과 대응과 이전 계약](result-integrity.md)을 따른다. 샘플 체크는 DB 전체 보장의 증명이 아니다.

## 업무 담당자가 이해할 수 있는 설명 필드

새 보고서는 전문 용어를 아는 독자를 가정하지 않는다. 엔터티 `description`은 어떤 정보를 왜 관리하는지, `grain`은 표 한 줄의 의미, `example`은 실제 샘플의 인물·코드·금액에 맞는 예, `review_question`은 업무 담당자가 판단할 질문이다. 설명은 문자열이다. `columns[].label`은 비어 있지 않은 업무용 이름이며 속성·샘플 표에서 영문 이름과 함께 표시한다. 관계의 `explanation`에는 연결의 업무 이유와 예를 쓴다.

시나리오 `explanation = {situation, expected_behavior, why_it_matters}`는 세 개의 비어 있지 않은 문자열이다. 업무상 기대 동작을 업무 확인 결과로 보여준다. 전체 설명과 실행 자료는 재생성용 원본 파일에 보존하며 SQL·원시 결과는 HTML에 넣지 않는다. 기대값을 그대로 문장으로 되풀이하지 말고 숫자와 거부 동작이 업무에 무엇을 뜻하는지 설명한다. `result_columns`와 expected 배열은 기본 모델 JSON의 필드가 아니다. 실제 SQL 실행을 별도로 검증할 때만 내부 입력에 작성한다. 실패·미실행에도 예상 동작은 설명할 수 있지만 실제로 달성한 결과처럼 쓰지 않는다.

출처 `reading_note`는 이 자료를 읽는 업무상 이유와 한계를 짧게 설명한다. 설계 결정에는 `example`, `review_question`, `technical_note`를 추가할 수 있다. 쉬운 설명을 먼저 읽고 기술 정의를 이어서 볼 수 있도록 작성한다. 모델의 원래 필드는 보존한다. SQL·원본 실행 결과는 재생성 파일에만 남기고 HTML이나 모달에 넣지 않는다.

요구사항의 전체 범위·전제 항목은 입력에 맞는 읽는 순서를, 참조의 용어 안내는 공통 용어 설명을 제공한다. ERD에는 PK/FK·개수 범례를 표시한다. 명시적인 compatibility 입력은 일부 설명이 없어도 동작하지만 생성기가 업무 의미나 예시를 임의로 보완하지 않는다. 특히 미작성 설명과 실행 보고서 없음은 그대로 알린다.

## 분량과 검토 기록

[설명 작성](report-writing.md)에 따라 역할·선택·공통 전제를 분리하고 같은 문장을 여러 필드에 복제하지 않는다. 필수 필드를 채우기 위해 가짜 위험·질문을 만들지 않는다. 검토 강도는 [설계 검토](design-review.md)의 복잡도 기준으로 정한다. `extensions.modeling_review`는 새 1.1 계약의 원자적 규칙·설계/합의 상태·비교 기준·구체 변경 기록을 연결한다. 이전 1.0 파일은 호환된다.

## 엔터티별 설명

`entities[].insights = {purpose, tradeoff, risk, decision_ids:[], source_ids:[], scenario_ids:[]}`. 필요한 설명만 비어 있지 않은 문자열로 작성하며 참조 ID는 해당 결정·출처·시나리오에 실제 존재해야 한다. 같은 일반 문장을 반복하지 말고 엔터티의 업무 문제·선택의 대가·미결 위험을 설명한다. 자동으로 속성 수나 관계 목록을 문장으로 바꾸지 않는다. 1.1에서 해석이 없으면 역할 설명을 읽고 가짜 위험·대가를 채우지 않는다. 1.0의 미작성 설명 표시는 호환 유지한다.

해석은 보고서 작성 시 판단한 내용이다. 검증 가능한 사실, 설계 추론, 미확인 위험을 혼동하지 않도록 쓴다. 전체 해석과 직접 연결된 조사·검증의 필요한 설명은 모델의 설명 하위 탭에서 읽는다. 내부 참조는 코드: 타이틀의 텍스트로 표시하고 미리보기 모달이나 이동 버튼을 만들지 않는다. 1.1 standard는 엔터티별 insights·업무 예·검토 질문을 생략할 수 있고 업무 이름·description·grain·항목 설명은 유지한다. 미작성을 유지하는 compatibility 입력은 명시적 허용이 필요하다.

## 이전 제작 입력의 선택 변환

기존 review-1.0.0 제작 입력은 build_model.py로 모델 JSON에 변환할 수 있다. 이 호환 경로도 JSON Schema와 참조·샘플·보고서의 원본 SHA를 검사하며 SQL을 실행하거나 HTML을 만들지 않는다. 새 사례에는 직접 작성용 모델 JSON을 사용한다. 기존 공유 파일은 동봉 뷰어가 읽는다.

## 검토 쟁점과 요구사항 연결

`review_points = [{id,title,kind,question,options:[],recommendation,impact,entities:[],requirements:[],scenario_ids?:[]}]`. kind는 `decision`(업무 정책), `scope`(제외 범위), `verification`(실행 미검증)이다. 제목·질문·추천·영향은 비어 있지 않은 문자열, 선택지는 비어 있지 않은 문자열 배열이다. 관련 ID는 존재해야 한다. 추천은 사용자 승인 상태가 아니며 현재 제안·미확정으로 표시한다. 새 보고서는 엔터티별 위험을 이 쟁점 목록과 대조해 모두 다룬다.

위험 설명은 명시적인 review_points를 대신하지 않는다. 정책 결정·범위 제외·실행 미확인이 필요할 때 작성자가 해당 쟁점에 연결하고, 생성기는 위험 문장을 자동 승격하거나 선택지·결론을 만들지 않는다. 하단의 검토 쟁점 수는 이 중앙 목록의 수이고, 전제·일반 제한은 별도로 표시한다. 스펙에는 명시된 모델·결정·쟁점을 연결하고 확인 시나리오는 모델 탭의 업무 확인으로 연결한다. 연결 없음도 보존한다.


## 동봉 뷰어

assets/model-viewer.html은 스킬에 포함된 완성본이다. 개요·스펙·모델·참조 네 탭에서 데이터를 읽는다. 스펙은 요약·설계안·남은 결정으로, 모델은 업무 영역/확인 사항과 ERD·속성·설명·샘플로 구성한다. 실제 결과는 모델에서 방법·범위와 함께 읽고 SQL·원시 실행 배열은 표시하지 않는다. 화면을 바꾸어도 JSON 검사와 문서 형식은 독립적으로 유지한다.
