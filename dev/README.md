# 개발·검사·배포

설치 대상은 `skills/data-modeling/` 하나다. 개발 소스와 도구는 dev에만 두며 완성된 빈 뷰어를 스킬 assets에 동봉한다. 새 사례는 JSON만 만든다.

## 환경과 의존성

Python 3.11+ 전용 환경에서 `pip install -r skills/data-modeling/requirements.txt`, Node 환경에서 `npm ci --prefix dev/viewer`를 실행한다. Node/npm은 유지보수 때만 필요하다.

```text
JSON CLI → scripts/lib → 단일 JSON Schema + Python 의존성
뷰어 → ES 모듈 + 같은 Schema에서 컴파일한 검사기 + Graphviz
뷰어 빌드 → ES 모듈 번들 + CSS + 엔진 → 빈 HTML 하나
패키징 → 현재 소스/완성본 대조 + 실제 번들 검사 → 스킬 ZIP 하나
```

스키마는 `skills/data-modeling/references/schemas/model-2.0.0.schema.json`이 정본이다. 여러 이전 형식을 조합해 생성하지 않는다. 스키마를 바꾸면 오프라인 검사기를 다시 컴파일한다.

```bash
node dev/tools/build-transfer-validator.cjs
```

컴파일 기록은 스키마와 검사기 해시를 담는다. 빌드는 불일치한 검사기를 거부한다. 설치된 JSON 도구는 이 JavaScript·뷰어 파일·개발 릴리스를 읽지 않는다.

## 개발 중 전체 검사

```bash
python dev/tools/check.py --node node --development --output /tmp/data-modeling-check
```

임시 빈 뷰어만 만들며 사례 HTML은 만들지 않는다. 공통 행동 사례를 Python·JS 원본·실제 번들에 적용해 오류 코드·경고·결과 지문을 대조한다. 저장 실패 복구·출력 잠금·가져오기 실패·동시 가져오기·독립 JSON 설치·탭/샘플 드로어·ERD 범위를 확인한다. 모듈을 직접 불러오며 소스 문자열을 잘라 실행하지 않는다.

`check_examples.py`는 비품·예약·오픈마켓의 명시한 합성 샘플만 대조한다. 실제 결과를 다시 기록할 때만 `--record-observations`를 명시한다. 스키마 통과나 화면 작동을 실제 API/DB/동시성 검증으로 기록하지 않는다.

브라우저가 허용된 환경에서는 [UI 계약](viewer/UI.md)의 데스크톱 배치·오버플로·패널 드래그·미니맵 클릭·표 스크롤을 별도로 확인한다. Node와 최소 DOM fixture는 실제 CSS 배치 검사가 아니다. 브라우저 접근 정책을 다른 API나 localhost로 우회하지 않는다.

## 버전과 배포

- 스킬 패키지·JSON 생성기: `skills/data-modeling/version.json`의 skill/builder.
- 뷰어: `dev/viewer/version.json`의 version.
- 문서 계약: 단일 스키마의 version. 지원 계약은 현재 2.0.0 하나다.

뷰어만 바꾸면 viewer와 skill을 올리고 builder는 유지할 수 있다. JSON 생성 기록에는 builder와 입력/출력 해시만 있어 화면 변경의 영향을 받지 않는다.

소스·스키마 검사기·개발 검사를 갱신한 뒤 새 뷰어 버전을 봉인한다. 봉인한 명세를 덮어쓰지 않는다.

```bash
python dev/tools/release_viewer.py --version 2.0.0 --notes '변경 이유'
python dev/tools/build_viewer.py --node node
python dev/tools/check.py --node node --output /tmp/data-modeling-release-check
python dev/tools/package_skill.py --node node --output /tmp/data-modeling.zip --release
```

배포용 패키징은 실제 HTML의 소스 일치와 가져오기·내용 지문·모든 예제의 ERD 범위를 자동 검사한다. 화면 코드가 빠졌거나 소스/스키마가 달라진 뷰어를 넣지 않는다. ZIP 파일 순서·날짜·권한을 고정해 같은 환경에서 재현하고 전체 라이선스를 동봉한다. 파일별 해시와 패키지 버전은 dev/releases/skill-버전.json에 기록한다.

이전 개발 계약·공유 봉투·변환기·실행 코드 투영은 현재 배포에서 제거했다. 과거 원문은 Git 이력에서 확인할 수 있다. 기존 예제는 새 문서로 작성했으며 이전 통과 결과를 자동 이전하지 않았다.
