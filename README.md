# 데이터 모델링 스킬

업무 요구와 근거를 조사하고, **설계 이유·대안·샘플을 함께 검토하는 모델 JSON**을 만드는 Codex 스킬입니다. 앱 데이터베이스, 여러 시스템의 통합, 분석용 모델과 기존 스키마 개선에 사용합니다.

**[SKILL.md](skills/data-modeling/SKILL.md) · [설치 ZIP](https://github.com/kimyongin/data-modeling/releases/latest/download/data-modeling.zip) · [동봉 뷰어](skills/data-modeling/assets/model-viewer.html) · [예제](examples)**

## 목적과 특징

테이블 목록뿐 아니라 다음을 판단할 수 있게 합니다.

- 어떤 업무를 처리하며 한 행은 무엇을 뜻하는가?
- 어떤 규칙을 지켜야 하고 왜 이 구조를 선택했는가?
- 다른 설계의 이점과 대가, 미결 정책과 빠진 규칙은 무엇인가?
- 바꾸면 기존 데이터·조회·외부 계약·과거 집계에 어떤 영향이 있는가?
- 어떤 샘플을 실제로 확인했고 무엇은 아직 확인하지 않았는가?

비개발자도 업무용 이름과 예시로 읽을 수 있게 설명합니다. 단순한 목록은 짧게, 금전·격리·시간·동시성·통합·전환은 필요한 만큼 깊게 검토합니다. 사실·제안·미확인, 설계 반영·사용자 합의, 기대 동작·실제 결과를 구별합니다.

## 동작 방식

```text
요구와 범위 정리 → 근거 조사·규칙 누락 검토 → 대안 비교·모델 설계
→ 변경 영향·샘플 작성 → JSON 검사 → 동봉된 공통 뷰어에서 검토
```

새 사례에서는 **JSON만 작성**합니다. 뷰어는 스킬에 포함되어 있으며 이후에는 동료와 JSON만 공유할 수 있습니다. 직접 작성한 JSON도 같은 뷰어에서 가져옵니다. 별도 뷰어 배포나 사례별 HTML 생성이 필요 없습니다.

## JSON 2.0

문서 버전은 `version: "2.0.0"` 하나입니다. 이전 형식과 공유 봉투는 지원하지 않습니다. 개발 중인 계약을 정리한 변경이며 기존 예제도 모두 새 계약으로 갱신했습니다.

| 구성 | 내용 |
|---|---|
| document | 제목·목표·범위·복잡도·업무 연결 그림·제작 과정 |
| requirements / rules | 원하는 동작 / 지켜야 할 조건. 설계 문장을 중복 저장하지 않음 |
| decisions / issues | 선택지·판단 기준·선택 이유 / 남은 질문·추천·영향 |
| model | 엔터티·속성·관계·업무 영역. PK·유일 조합·물리 FK를 명시 |
| samples | 모델 정의와 분리한 데이터셋과 확인 시나리오 |
| observations | 실제 확인한 결과만 기록. 기록 없음은 미확인 |
| sources / assumptions / limitations | 근거·가정·한계 |
| change_impact | 비교 기준·구체 변경·영향 연결 |

키를 표시용 문자열에서 추측하지 않습니다. 선택지·판단 기준을 한 결정에 모으고, 요구사항은 규칙·모델·샘플과 ID로 연결합니다. 샘플 데이터셋은 독립적으로 검사합니다. 자세한 계약은 [작성 안내](skills/data-modeling/references/model-json.md)와 [단일 스키마](skills/data-modeling/references/schemas/model-2.0.0.schema.json)를 참고하세요.

ID 옆의 업무 식별 설명은 `display_attributes`로 지정할 수 있습니다. 예를 들어 계정의 `["market", "seller_key"]`, 옵션의 `["product_id", "name"]`입니다. 같은 데이터셋에서 전체 FK가 정확히 연결된 경우에만 설명을 붙이며 원래 ID는 보존합니다. 이 선택 필드는 뷰어 2.1.0·생성기 3.1.0부터 지원합니다. 기존 JSON 2.0 문서는 수정하지 않아도 읽을 수 있습니다.

## 설치와 사용법

### 스킬로 모델링 요청하기

[설치 ZIP](https://github.com/kimyongin/data-modeling/releases/latest/download/data-modeling.zip)의 `data-modeling/` 폴더를 사용하는 Codex의 스킬 설치 경로에 넣습니다. 기존 설치본은 백업하고 교체합니다. GitHub 경로로 설치할 때 선택할 폴더는 **`skills/data-modeling`**입니다.

```text
$data-modeling
회의실 예약 모델을 설계해줘.
같은 방의 예약 시간이 겹치면 안 되고 취소한 시간은 다시 예약할 수 있어야 해.
DB는 아직 정하지 않았어. 대안·빠진 업무 규칙·변경 영향을 검토하고,
JSON만 만들어 스킬에 포함된 공통 뷰어에서 확인해줘.
```

기존 모델을 개선할 때는 현재 모델·조회·API·자료 예시와 바꾸려는 동작을 제공합니다. 접근하지 못한 자료는 미확인으로 남깁니다.

### JSON 직접 작성·검사하기

설치된 스킬 폴더에서 Python 3.11+의 전용 환경을 준비합니다.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp references/example-model.json source.json
.venv/bin/python scripts/validate_model.py source.json
.venv/bin/python scripts/build_model.py source.json --output cases/example.model.json
```

빌더는 원본을 유지하고 JSON과 `.build.json` 생성 기록만 만듭니다. 직접 작성 파일은 검사 후 바로 뷰어에 가져올 수도 있습니다. 일반 모델링에 Node·뷰어 빌드·SQL은 필요 없습니다.

확인 결과가 있는 내용을 바꿨다면 실제 확인을 다시 하거나 결과를 제거해야 합니다. 다음 명령은 확인했다고 주장하지 않고 결과를 제거한 복사본을 만듭니다.

```bash
.venv/bin/python scripts/build_model.py edited.json --clear-observations --output updated.model.json
```

형식·참조·모든 샘플의 PK/필수 값/유일 조합/FK와 결과의 내용 대응을 검사합니다. 경고는 업무 검토의 빠진 연결을 알려주며, 통과를 업무 합의·DB 동시성·운영 준비 완료로 해석하지 않습니다.

### 동봉 뷰어에서 확인·공유하기

1. 설치 폴더의 **`assets/model-viewer.html`**을 브라우저에서 엽니다.
2. **가져오기**에서 직접 작성·생성·공유받은 `.model.json`을 선택하거나 복사한 모델 JSON을 화면에 붙여넣습니다. 검색창 등 텍스트 입력에서는 원래 붙여넣기가 유지됩니다.
3. **개요·스펙·모델·참조**에서 연결 그림, 규칙과 대안, ERD·속성·설명·샘플을 검토합니다.
4. **내보내기**는 필터와 관계없이 전체 JSON을 저장합니다. 화면 선택 상태는 업무 데이터에 넣지 않습니다.

뷰어는 오프라인으로 동작하며 데이터를 서버나 브라우저 저장소에 자동 보관하지 않습니다. 새로고침하면 빈 화면입니다. 잘못된 파일이나 새 화면 생성 실패는 기존 화면을 유지합니다.

모델은 업무 영역 또는 확인 사항으로 좁혀 보고, 선택해도 ERD의 배율·위치는 유지합니다. 샘플은 중앙 하단 드로어로 열고 높이를 조절합니다. 양쪽 패널과 드로어의 선호 크기는 창을 줄였다 늘려도 복원됩니다. 스펙 검색은 연결된 설계 판단까지 포함하며, 다른 확인 사항을 선택하면 새 설명의 시작 부분을 보여줍니다. ERD의 범례·관계선 강조와 샘플의 업무 식별 설명·값 구분으로 읽기를 돕습니다.

확인 사항은 제목·상황과 기록 상태로 검색합니다. 검색은 현재 검토 화면을 바꾸지 않습니다. 확인 사항에서 보던 데이터셋은 업무 영역·전체 보기로 넓혀도 유지하며, 여러 예시가 있으면 샘플 드로어에서 명시적으로 선택합니다. 모델 설명은 관련 규칙과 선택 이유·대가에 집중하고 전체 대안은 스펙에 보존합니다. 드로어를 열면 미니맵은 위로 이동하고 화면 맞춤은 가려지지 않은 ERD 공간을 기준으로 합니다.

스펙·참조·확인 사항 검색은 공백으로 나눈 모든 단어를 순서와 대소문자에 관계없이 찾습니다. 예를 들어 `R-01 조회`로 코드와 내용의 단어를 함께 찾을 수 있습니다. **스펙과 모델에는 최신 설계만 표시**하고, 전후 비교와 변경 영향은 **참조 → 설계 변경 기록**에서 따로 읽습니다. 변경이 많아도 선택한 항목 하나의 비교만 표시하며 선택은 탭을 오가도 유지합니다. 기준 설계와 이번 설계의 비교이므로 모든 버전의 누적 이력은 아닙니다.

변경 기록은 연결 속성 등의 하위 항목을 업무 이름으로 풀고, 추가·제외·순서 변경·미기록을 구분합니다. 파일 오류는 문제 항목·모델 이름·가능한 선택지·수정 방법을 안내하고, 문법 오류는 구체적 원인과 행·열을 표시합니다. 오류가 나도 기존 검토 화면은 유지합니다.

## 예제

- [오픈마켓 상품·매출 통합](examples/openmarket.model.json): 쿠팡·네이버·11번가·G마켓 전용 모델과 공통 상품·주문·매출을 연결합니다. 상품 A의 통합 순결제액 55,000원과 마켓별 금액, 미귀속을 포함한 전체 60,000원을 합성 샘플로 다시 대조했습니다. 실제 계정 API·관리자 콘솔·운영 DB·동시 처리와 미확인 상세 필드는 검증하지 않았습니다.
- [회의실 예약 변경](examples/booking-change.model.json): 사업장별 방 식별을 합성 샘플로 대조했습니다. 시간 충돌·정원·취소 이력·권한·전환 등은 설계와 미결 정책을 구별하며 실제 구현 결과를 주장하지 않습니다.
- [비품 분류](examples/inventory.model.json): 이름 변경 전후의 독립 데이터셋과 분류 연결 유지를 합성 샘플로 대조했습니다. 실제 DB 갱신·삭제 거절 실행은 확인하지 않았습니다.

예제에는 이번에 실제 확인한 결과만 기록했습니다. 이전 성공 결과는 새 형식으로 복사하지 않았습니다. [직접 작성 시작점](skills/data-modeling/references/example-model.json)은 결과가 없는 비품 예제입니다.

## 구조와 의존성

```text
skills/data-modeling/       설치·배포 단위 하나
  SKILL.md
  agents/
  references/              지침·단일 JSON Schema·작성 예제
  scripts/                 JSON 생성·검사와 lib/
  assets/model-viewer.html 완성된 오프라인 뷰어
  assets/NOTICE.txt
  requirements.txt
  version.json             스킬 패키지·생성기 버전
examples/                  공개 사례 JSON
dev/
  viewer/                  상태·검사·화면 내용·ERD·크기 조절 모듈과 CSS
  tools/                   검사기 컴파일·뷰어 빌드·릴리스·패키징
  tests/                   공통 판정 사례·저장/가져오기 실패·화면 구조·ERD 검사
  releases/                현재 릴리스·생성 기록
```

JSON 생성·검사는 뷰어 코드·개발 도구·뷰어 릴리스 해시를 읽지 않습니다. 뷰어의 ES 모듈·CSS·스키마 검사기·배치 엔진은 유지보수 때 HTML 하나로 묶습니다. 설치 ZIP에는 개발 도구와 Node 의존성을 넣지 않습니다.

스킬 패키지 **3.5.3**, JSON 생성기 **3.1.0**, 뷰어 **2.5.3**, 문서 계약 **2.0.0**을 별도로 관리합니다. 이번 변경은 미니맵을 ERD 작업 영역 너비와 남은 높이에 비례하게 조절하는 개선입니다. 일반 화면에서는 작게, 큰 화면에서는 최대 320×200px까지 표시합니다. 스펙·참조의 읽던 위치 복원과 미니맵 강조 동기화도 유지합니다. 미니맵 드래그·포커스 복원과 JSON 붙여넣기 가져오기도 유지합니다. 탭 포커스·상단 안내·확대 및 축소 버튼 이름 개선도 유지하며 JSON 계약·생성기 버전은 바꾸지 않습니다.

패키징은 현재 소스와 완성된 뷰어의 일치를 확인하고 실제 번들의 가져오기·ERD 검사를 실행한 후 ZIP을 만듭니다. 모델과 생성 기록은 저장 실패 시 복구하며, 중단된 두 파일의 해시 불일치도 검사할 수 있습니다.

개발·전체 검사·빌드·배포 절차는 [개발 안내](dev/README.md), 화면 조작 규칙은 설치 스킬에도 동봉하는 [UI 지침](skills/data-modeling/references/viewer-ui.md)에 있습니다. 검색·선택·크기 복원·샘플·ERD·접근성 회귀 검사는 패키징의 필수 관문입니다. Node의 번들·DOM 상태 검사와 실제 브라우저 시각 검사는 구별합니다.

## 모델링 기준과 출처

[조사·모델링 기준](skills/data-modeling/references/modeling-guide.md) · [설계 검토](skills/data-modeling/references/design-review.md) · [쉬운 설명](skills/data-modeling/references/report-writing.md) · [결과 대응](skills/data-modeling/references/result-integrity.md) · [참고 공개 스킬](skills/data-modeling/references/sources.md)

라이브러리 전체 라이선스는 [동봉 NOTICE](skills/data-modeling/assets/NOTICE.txt)와 HTML에 포함됩니다.
