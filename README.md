# 데이터 모델링 스킬

업무 요구와 근거를 조사하고, **설계 이유·대안·샘플을 함께 검토할 모델 JSON**을 만드는 Codex 스킬입니다. 앱 데이터베이스, 여러 시스템의 통합, 분석용 모델, 기존 스키마 개선에 사용합니다.

**[스킬 본문](skills/data-modeling/SKILL.md) · [설치용 ZIP](https://github.com/kimyongin/data-modeling/releases/latest/download/data-modeling.zip) · [동봉 뷰어](skills/data-modeling/assets/model-viewer.html) · [예제](examples)**

뷰어는 스킬에 포함됩니다. 설치 패키지 하나를 받으면 지침·JSON 생성/검사 도구·완성된 뷰어를 함께 사용할 수 있습니다. 새 사례에서는 JSON만 만듭니다.

## 목적과 특징

테이블 목록을 넘어 다음을 판단할 수 있게 합니다.

- 어떤 업무·조회 요구를 처리하며 한 행은 무엇을 뜻하는가?
- 왜 나누고 연결했으며 다른 선택의 이점과 대가는 무엇인가?
- 빠진 규칙과 아직 정하지 않은 정책은 무엇인가?
- 변경하면 기존 데이터·조회·외부 계약·과거 집계에 어떤 영향이 있는가?
- 샘플에서 어떤 상황을 확인했고 무엇은 실행하지 않았는가?

요구사항·공식 API·접근 가능한 관리자 자료·기존 DB·파일을 조사하고 사실·제안·미확인을 구별합니다. 단순한 업무는 짧게 설명하고 금전·격리·원천 충돌·이력·동시성·전환은 깊게 검토합니다. 규칙마다 설계 반영과 합의 상태를 따로 기록하며, 핵심 대안과 구체 변경 대상을 연결합니다.

비개발자도 업무용 이름과 샘플로 읽을 수 있게 설명합니다. 형식·샘플 검사가 통과했다는 사실을 업무 합의나 운영 준비 완료로 해석하지 않습니다.

## 동작 방식

```text
요구사항·범위 정리
  → 근거 조사·업무 규칙과 누락 분석
  → 대안 비교·모델 설계·변경 영향 검토
  → 설계를 구분하는 샘플 작성
  → JSON 작성·검사
  → 스킬에 동봉된 뷰어에서 확인
```

스킬은 조사와 설계 판단을 안내합니다. Python 도구는 JSON Schema·참조·모든 샘플의 PK/필수 값/명시한 유일 조합/FK와 결과의 내용 대응을 검사합니다. 뷰어는 JSON을 읽어 개요·스펙·모델·참조의 네 탭으로 표시합니다.

**JSON 검사와 뷰어 빌드는 독립적입니다.** 검사기는 뷰어 HTML·JavaScript·CSS·개발 도구·뷰어 릴리스 해시를 읽지 않습니다. 생성 기록에는 JSON 생성기 버전과 입력/출력 해시를 남깁니다. 화면 디자인을 바꿔도 업무 JSON을 다시 만들 필요가 없습니다.

## 저장소 구조

```text
skills/data-modeling/       실제 설치·배포할 스킬
  SKILL.md
  agents/openai.yaml
  references/              모델링 지침·JSON Schema·직접 작성 예제
  scripts/                 JSON 생성·검사·이전, lib/ 공통 로직
  assets/model-viewer.html 완성된 공통 뷰어
  assets/NOTICE.txt
  requirements.txt
examples/                  오픈마켓·예약·비품 사례 JSON
dev/                      개발 영역
  viewer/                  뷰어 JavaScript·CSS·라이브러리 원본
  tests/                   회귀·구조·패키지 검사
  tools/                   뷰어 빌드·검사기 컴파일·스킬 패키징
  releases/                뷰어·스킬 패키지 릴리스 기록
```

`skills/data-modeling/`만 설치하면 됩니다. 개발 영역은 설치 ZIP에 들어가지 않습니다. 뷰어 개발 소스는 유지보수 때 동봉 HTML로 빌드하고 스킬 업데이트에 함께 포함합니다.

## 사용법

### 1. 스킬 설치와 모델링 요청

[설치용 ZIP](https://github.com/kimyongin/data-modeling/releases/latest/download/data-modeling.zip)의 `data-modeling/` 폴더를 사용 중인 Codex의 스킬 설치 경로에 넣습니다. 기존 설치본은 별도로 백업한 뒤 갱신합니다. GitHub 경로로 설치할 때 선택할 폴더는 **`skills/data-modeling`**입니다.

1.x에서 저장소 루트를 스킬로 설치했다면 2.0부터는 이 하위 폴더 또는 ZIP의 `data-modeling/` 내용으로 기존 설치 경로를 갱신합니다. 검사 명령은 `scripts/validate_model.py`, 뷰어 위치는 `assets/model-viewer.html`입니다. 기존 모델 JSON은 그대로 사용할 수 있습니다.

```text
$data-modeling
회의실 예약 모델을 설계해줘.
같은 방의 예약 시간이 겹치면 안 되고, 취소한 시간은 다시 예약할 수 있어야 해.
DB는 아직 정하지 않았어. 대안과 빠진 업무 규칙을 검토하고,
JSON만 만들어 스킬에 포함된 뷰어에서 확인해줘.
```

기존 모델 개선에는 현재 스키마·조회·API·자료 예시와 바꾸려는 동작을 제공합니다. 접근하지 못한 자료는 미확인으로 남깁니다.

### 2. JSON 직접 작성·검사·생성

설치된 스킬 폴더에서 Python 3.11+의 전용 환경을 준비합니다. 새 사례에 Node·뷰어 빌드·SQL·렌더러 핀은 필요 없습니다.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp references/example-model.json source.json
.venv/bin/python scripts/validate_model.py source.json
.venv/bin/python scripts/build_model.py source.json --output cases/example.model.json
```

완전한 시작점은 [직접 작성 예제](skills/data-modeling/references/example-model.json), 상세 필드는 [작성 안내](skills/data-modeling/references/model-json.md)와 [모델 스키마](skills/data-modeling/references/schemas/model-1.1.0.schema.json)를 따릅니다. 새 문서는 모델 형식 1.1.0과 검토 기록 1.1.0을 사용합니다.

생성기는 원본을 보존하고 `.model.json`과 추적용 `.model.build.json`만 만듭니다. 같은 입력·옵션·JSON 도구 배포본이면 결과가 같습니다. JSON을 검사한 뒤 그대로 뷰어에 가져올 수도 있습니다.

기본 이름·역할·항목 정의는 작성하되 엔터티마다 예·질문·위험을 반복하지 않습니다. 업무 핵심·근거/운영 지원·조건부 확장을 구별하고 유일성 범위는 `unique_keys`의 열 조합으로 기록합니다.

실제 확인 결과는 방법·범위·현재 내용 지문과 함께 기록합니다. 수정 뒤 남은 오래된 결과는 거부합니다. 다시 확인하지 않았다면 이전 결과를 명시적으로 제거한 복사본을 만듭니다.

```bash
.venv/bin/python scripts/build_model.py edited.json --clear-verification --output updated.model.json
```

### 3. 동봉 뷰어에서 확인·공유

1. 설치 폴더의 **`assets/model-viewer.html`**을 Chrome 또는 Edge에서 엽니다.
2. **가져오기**에서 직접 작성·생성한 `.model.json`을 선택합니다.
3. 개요의 큰 그림, 스펙의 요약/설계안/남은 결정, 모델의 ERD/속성/설명/샘플, 참조 자료를 확인합니다.
4. 동료도 같은 스킬 패키지에 포함된 뷰어를 사용합니다. 이후 사례는 JSON만 공유합니다.

뷰어는 오프라인으로 동작하며 업무 데이터를 서버나 브라우저 저장소에 자동 보관하지 않습니다. 새로고침하면 빈 뷰어로 돌아갑니다. 내보내기는 현재 필터와 무관하게 전체 JSON을 보존합니다. 새 사례마다 HTML을 만들지 않습니다.

### 4. 이전 형식

이전 1.0 모델 JSON과 기존 공유 파일도 동봉 뷰어에서 읽습니다. 1.0 결과는 현재 입력 대응을 확인할 수 없는 **이전 확인 기록**으로 구분합니다. 새 형식이 필요할 때만 원본을 보존해 명시적으로 이전합니다.

```bash
.venv/bin/python scripts/migrate_model.py old.model.json --output upgraded.model.json
```

이전 결과는 원본에 남고 새 문서의 활성 결과에서 제거됩니다. 기존 제작용 입력의 선택 변환도 JSON 생성기에 유지하지만 SQL을 실행하거나 HTML을 만들지 않습니다. 자세한 방법과 한계는 [결과 계약](skills/data-modeling/references/result-integrity.md)을 따릅니다.

## 예제

- [오픈마켓 통합 상품·매출](examples/openmarket.model.json): 쿠팡·네이버·11번가·G마켓 전용 모델과 통합 상품·주문·매출을 연결합니다. 상품별 통합/마켓별 매출, 수집 누락·중복·역순·귀속 정정과 대안·변경 영향을 다룹니다. 합성 샘플 대조·순차 예시의 결과를 포함하며 실제 계정 API·관리자 콘솔·운영 DB 및 11번가 상세 필드는 미확인입니다.
- [회의실 예약 변경](examples/booking-change.model.json): 준비 시간·정원·취소 이력 등 미결 정책과 쓰기·조회·전환·복구 영향을 검토합니다. 운영 기준과 실제 구현은 미확인입니다.
- [비품 분류 목록](examples/inventory.model.json): 단순한 새 설계의 식별·분류·삭제 규칙과 대안을 짧게 설명합니다.

세 파일은 동봉 뷰어에서 바로 가져옵니다. 예약·비품 예제의 확인 결과는 미실행이며, 예제 데이터와 결과를 뷰어 버전에 맞추려고 자동 수정하지 않습니다.

## 개발·유지보수

스킬/JSON 도구 버전은 **2.0.0**, 뷰어 버전은 **1.2.0**, 모델 JSON 형식은 **1.1.0**입니다. 각 버전은 별도로 관리합니다. 이전 스키마와 릴리스 기록은 보존합니다.

저장소 루트에서 기존 Python 환경을 사용해 검사하고 뷰어를 빌드할 수 있습니다.

```bash
python dev/tests/audit_integrity.py --output /tmp/integrity.json
node dev/tests/audit_spec_sections.cjs examples/test-manifest.json /tmp/spec-sections.json
python dev/tests/test_architecture.py --output /tmp/architecture.json
python dev/tools/build_viewer.py --check
python dev/tools/package_skill.py --output /tmp/data-modeling.zip
```

Python 환경에는 `skills/data-modeling/requirements.txt`의 의존성이 필요합니다. Node 검사는 유지보수용입니다. 상세한 검사기 컴파일·새 뷰어 릴리스·패키징은 [개발 안내](dev/README.md)를 따릅니다.

## 모델링 문서

- [스킬 본문](skills/data-modeling/SKILL.md)
- [조사·설계 기준](skills/data-modeling/references/modeling-guide.md)
- [복잡도·대안·규칙·변경 영향](skills/data-modeling/references/design-review.md)
- [쉬운 설명 작성](skills/data-modeling/references/report-writing.md)
- [JSON 데이터 계약](skills/data-modeling/references/review-contract.md)
- [샘플·결과 대응](skills/data-modeling/references/result-integrity.md)
- [참고한 공개 스킬](skills/data-modeling/references/sources.md)

뷰어의 라이브러리 출처와 전체 라이선스는 [동봉 NOTICE](skills/data-modeling/assets/NOTICE.txt)에 있으며 HTML에도 포함됩니다.
