# 개발·유지보수

사용자에게 배포하는 단위는 `skills/data-modeling/` 하나다. 완성된 `assets/model-viewer.html`을 포함하며, dev 폴더나 뷰어 소스를 설치하지 않아도 JSON 생성·검사·보기가 가능하다.

## 의존성 방향

```text
스킬 scripts/*.py → scripts/lib/ → references/schemas/ + requirements.txt
뷰어 빌드 도구 → dev/viewer/ + 같은 JSON Schema
패키징 도구 → 완성된 skills/data-modeling/ → ZIP 하나
```

JSON 도구는 assets/dev/뷰어 릴리스 파일을 읽지 않는다. 뷰어·스키마·JSON 도구의 검토와 버전은 별개다. 데이터 계약을 변경하지 않는 화면 수정에는 업무 JSON 재생성이 필요 없다. 기존 build_metadata의 뷰어 버전은 파일 추적 정보로 읽고, 신규 생성 기록에는 builder_version과 입력/출력 해시를 쓴다.

## 환경

Python 3.11+의 전용 환경에 `skills/data-modeling/requirements.txt`를 설치한다. 아래 명령은 저장소 루트에서 해당 Python으로 실행한다. 일반 모델링은 Python 도구와 동봉 HTML만 사용한다.

뷰어의 스키마 검사기를 변경할 때만 Node/npm 의존성을 설치한다.

```bash
npm ci --prefix dev/viewer
node dev/tools/build-transfer-validator.cjs
```

뷰어 CSS/JS는 `dev/viewer/`, JSON Schema의 정본은 `skills/data-modeling/references/schemas/`에 있다. 이미 배포한 스키마를 덮어쓰지 않는다. 스키마 생성 도구는 기존 버전을 재현하거나 새 버전을 만들 때만 사용한다.

## 검사

```bash
python dev/tests/audit_integrity.py --output /tmp/integrity.json --node node
python dev/tests/audit_design_review.py --manifest examples/test-manifest.json --output /tmp/design-review.json
node dev/tests/audit_spec_sections.cjs examples/test-manifest.json /tmp/spec-sections.json
python dev/tests/test_architecture.py --output /tmp/architecture.json --node node
node dev/tests/check_bundle.cjs skills/data-modeling/assets/model-viewer.html examples/test-manifest.json /tmp/bundle.json
```

검사는 오래된 결과·PK/필수 값/유일 조합/FK·원자 규칙·선택지·변경 영향·Python/뷰어 검사 일치와 JSON-only 생성을 포함한다. 구조 검사는 dev와 뷰어를 제거한 설치 사본에서도 JSON 도구가 동작하는지, 화면 파일을 바꿔도 JSON/생성 기록이 같은지, ZIP을 다른 경로에 풀어도 세 CLI가 동작하는지 확인한다. 번들 검사는 실제 HTML 안의 검사 코드로 예제를 가져오기/내보내기하고 동봉된 ERD 엔진을 실행한다. 브라우저 화면의 간격·오버플로 확인과 구별한다.

실제 브라우저가 허용된 환경에서는 Playwright·Chrome을 별도로 준비해 다음 검사도 수행한다. manifest의 input/model은 절대 경로나 실행 위치 기준 경로를 사용한다. `PLAYWRIGHT_MODULE`/`CHROME_PATH`로 실행 환경을 지정할 수 있다.

```bash
node dev/tests/check_integrity_viewer.cjs examples/test-manifest.json skills/data-modeling/assets/model-viewer.html /tmp/viewer-ui.json
```

브라우저 접근 정책이 차단하면 다른 API나 브라우저로 우회하지 않는다. 수행하지 않은 시각 검사를 통과한 것으로 보고하지 않는다. UI의 유지보수 계약은 [뷰어 화면 계약](viewer/UI.md)을 따른다.

## 뷰어 빌드와 스킬 패키징

뷰어를 바꾸면 소스·스키마 검사기·회귀 검사를 먼저 갱신한다. 기존 릴리스는 덮어쓰지 않고 새 버전으로 봉인한다.

```bash
python dev/tools/release_viewer.py --version <새 버전> --notes '<변경 이유>'
python dev/tools/build_viewer.py
python dev/tools/build_viewer.py --check
python dev/tools/package_skill.py --output /tmp/data-modeling.zip
```

빌드는 완성된 HTML을 `skills/data-modeling/assets/model-viewer.html`에 쓰며 사례 데이터는 넣지 않는다. 생성 기록은 `dev/releases/viewer-build.json`에 남긴다. `--output`으로 시험용 경로를 지정할 수 있다. 새 사례에 이 명령을 실행하지 않는다.

스킬의 JSON 도구·지침을 배포할 때 `scripts/lib/contract.py`의 BUILDER_VERSION을 갱신하고 검사 후 `package_skill.py --release`로 불변 패키지 명세를 기록한다. ZIP의 파일 순서·날짜·권한을 고정해 같은 파일은 같은 환경에서 같은 ZIP이 된다. 패키지에는 SKILL.md·agents·references·scripts·assets·requirements.txt만 포함되며 전체 라이선스와 빈 뷰어를 함께 검사한다. dev·예제 모음·캐시·Node 의존성은 포함하지 않는다.

공개 사례는 `examples/`에 관리하고 최소 직접 작성 예제는 스킬 references에 유지한다. 예제를 수정하면 실제 결과를 다시 수행하거나 제거하고 내용 지문만 임의로 갱신하지 않는다.

## 이전 릴리스 기록

1.0.0~1.1.1의 명세는 이전 저장소 경로를 담은 역사 기록이며 원문 바이트를 보존한다. 현재 JSON 도구는 해당 명세에 의존하지 않는다. 기존 공유 파일 지원은 `viewer/share-compatibility.json`의 명시적인 이전 릴리스 해시로 유지한다. 새 뷰어 명세는 `viewer-<버전>.json`, 스킬 패키지 명세는 `skill-<버전>.json`으로 구별한다.
