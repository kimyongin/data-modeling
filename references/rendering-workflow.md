# 모델 JSON 작성과 고정 공통 뷰어

새 사례의 기본 결과는 `<사례명>.model.json`이다. 직접 JSON을 작성하고 검사한 뒤 기존 공통 뷰어에서 연다. 사례마다 HTML이나 뷰어를 생성하지 않는다. 업무별 화면 코드도 만들지 않는다.

## 환경과 버전

Python 3.11+의 전용 환경에 requirements.txt를 설치한다. 정상 사용 중 의존성·공통 코드·스키마를 바꾸지 않는다. 현재 제작 입력 스키마는 1.0.0, 기본 모델 문서 형식은 1.1.0, 생성기 버전은 renderer-release.json에서 확인한다. 모델 JSON의 호환성은 형식/데이터 스키마로 결정하고 렌더러 핀은 직접 작성하지 않는다.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r <skill-dir>/requirements.txt
```

## 새 사례: JSON을 직접 작성

1. [직접 작성 안내](model-json.md)와 [완전한 예제](example-model.json)를 읽고 model-1.1.0.schema.json에 맞춰 standard 문서를 작성한다. 업무 설명·근거·관계·샘플·남은 판단을 채운다.
2. validate_review.py로 문법·스키마·ID/관계/열/샘플 연결을 확인한다. 검증하지 못한 확인 결과는 비워 두고 미실행으로 표시한다.
3. JSON을 기존 dist/model-viewer.html에서 가져와 개요/스펙/ERD/설명/샘플을 읽는다. 최종 JSON과 재사용하는 뷰어 링크를 전달한다.

```bash
.venv/bin/python <skill-dir>/scripts/validate_review.py <case>/case.model.json
```

직접 작성한 문서를 파일로 정리할 때는 기본 생성기를 사용한다. 이 명령은 JSON과 .build.json만 만들며 업무 내용·선택 필드·확인 상태를 보존한다.

```bash
.venv/bin/python <skill-dir>/scripts/build_model.py <case>/source.json --output <case>/case.model.json
```

## 내부 실행 검증 자료를 사용하는 경우

이미 존재하는 review-1.0.0.schema.json 자료의 선택적 변환 경로를 호환 유지한다. 새 사례에 SQL을 작성하거나 전용 검증 탭을 추가하지 않는다. 이때만 renderer_version을 현재 릴리스에 고정하고, 기대 결과/DDL/SQL 등을 내부 파일에 보존한다. 필요하고 가능한 실행 검증에만 verify_sqlite.py를 사용한다. 다른 모델에 SQLite나 실행 보고서를 강요하지 않는다.

```bash
.venv/bin/python <skill-dir>/scripts/verify_sqlite.py <case>/review.json --output <case>/verification.json
.venv/bin/python <skill-dir>/scripts/build_model.py <case>/review.json --verification <case>/verification.json --output <case>/case.model.json
```

실행 보고서가 없으면 --verification을 생략한다. 오래된/다른 입력의 보고서·잘못된 상태/시나리오 대응은 거부한다. 기본 JSON에는 SQL·원시 실행 배열을 넣지 않는다. 생성기를 거쳐도 미실행을 통과로 바꾸지 않는다. 실제 결과를 기대값에 맞추려고 고치지 않는다.

## 두 형식과 확인 결과의 의미

- **기본 모델 JSON(data-modeling-model, 1.1.0):** 직접 작성/스킬 생성/파일 공유 모두 사용한다. format/format_version/review가 필수다. 체크섬이나 렌더러 해시가 없어도 된다. JSON을 편집하고 재검사·가져오기로 갱신한다. verification과 build_metadata는 선택이다.
- **이전 공유 JSON(data-modeling-share, 1.0.0):** 이미 배포한 내보내기 파일용이다. 기존 체크섬과 명시적으로 지원하는 릴리스 해시를 계속 검사한다. 새 사례를 이 형식으로 강제하지 않는다.

새 결과는 방법·범위와 review 내용 지문을 기록한다. 내용이 바뀌면 이전 결과를 거부하며, 다시 수행하지 않았다면 --clear-verification으로 명시적으로 제거한다. 이전 1.0 결과는 입력 대응 미확인인 과거 기록으로 표시한다. [결과 계약](result-integrity.md)을 따른다. 모든 실제 결과는 JSON에 기록된 내용이며 뷰어가 새로 실행/서명한 결과가 아니다. 결과가 없는 모델은 미실행이다. 기본 모델의 생성기 버전은 추적 정보이며, 같은 데이터 스키마인데 UI 버전만 다르다는 이유로 가져오기를 막지 않는다. 지원하지 않는 데이터 형식/스키마는 뷰어 갱신이 필요하다.

## 공통 뷰어와 명시적인 HTML 생성

dist/model-viewer.html은 업무 데이터 없는 고정 뷰어다. 처음 한 번 전달한 뒤 지원하는 JSON만 주고받는다. 새로고침하면 빈 상태로 돌아가며 데이터를 브라우저 저장소/서버에 자동 보관하지 않는다. 직접 작성·생성·공유 파일 모두 같은 화면을 쓴다.

뷰어를 재생성하는 다음 명령은 뷰어 유지보수/배포용이며 새 업무의 정상 절차가 아니다.

```bash
.venv/bin/python <skill-dir>/scripts/render_review.py --viewer --output model-viewer.html
```

독립 HTML은 사용자 명시 요청 또는 유지보수 회귀 검사에만 만든다. 새 업무의 기본 산출물이나 검토 전제 조건으로 만들지 않는다. HTML은 반드시 --format html을 명시해야 한다. .html 파일명만 지정하면 거부하며 JSON 기본 모드를 유지한다. render_review.py에 .json 출력을 지정하면 기본 생성기와 같은 모델 JSON 투영을 사용한다.

```bash
.venv/bin/python <skill-dir>/scripts/render_review.py review.json --output case.model.json
# 명시적으로 독립 HTML이 필요한 경우에만:
.venv/bin/python <skill-dir>/scripts/render_review.py review.json --format html --output model-review.html
```

## 고정 생성기와 릴리스 유지보수

기본 생성기는 파일 해시가 고정된 공통 코드·로컬 스키마·의존성만 사용하며 일반 생성 중 네트워크가 필요 없다. build_model.py가 만든 .build.json에는 입력·선택 실행 보고서·릴리스·출력 JSON의 해시를 기록한다. 직접 작성하여 바로 여는 JSON에 생성 기록을 필수로 강요하지 않는다. 같은 입력/실행 자료/배포본이면 같은 JSON이 나온다.

사용자가 화면/생성 방식 개선을 요청한 경우에만 유지보수 모드다. 이전 ZIP·입력·기록을 보존하고 공통 코드/지침/스키마/검사를 수정한 뒤 release_renderer.py --version <새 버전> --notes '<이유>'로 새 릴리스를 발행한다. 기존 번호/이력을 덮어쓰지 않는다. 테스트로 직접 작성 JSON과 기존 내보내기 파일·실패/미실행·다른 업무의 JSON을 같은 뷰어에서 검사한다. 소스/설치본/ZIP·JSON/뷰어 재생성 바이트를 비교한다.

1.1 계약의 원본은 tools/create_model_schema.py로 생성하고, 이미 배포한 1.0 스키마는 수정하지 않는다. 스키마를 바꾸면 Ajv 8.17.1/esbuild 0.25.12의 고정 빌드로 브라우저 검사기를 다시 컴파일한다. 일반 사용자는 Node/npm을 설치하지 않는다. 동적 스크립트나 원격 라이브러리를 JSON에서 불러오지 않는다. 이전 제작 입력의 버전 이전은 원본을 보존하고 migrate_review.py로 명시적으로 수행한다.

## 설계 검토 기록

새 사례는 [설계 검토](design-review.md)에 따라 `review.extensions.modeling_review`를 작성한다. 복잡도·대안·규칙 누락·변경 영향의 연결을 검사하고 생성 기록의 `design_review`에 경고를 남긴다. 기존 1.0 파일은 원본을 유지해 읽으며 새 문서는 1.1 계약을 따르고 사례마다 HTML을 만들지 않는다. 업무 설명 원문은 기존 결정·미결 사항·전제에 한 번 작성하고 [설명 작성](report-writing.md)에 따라 중복을 줄인다. 이 검토 기록이나 경고 0개는 실제 실행 통과를 뜻하지 않는다.

## 1.1 형식 도입 시 한 번의 뷰어 갱신

1.0만 지원하는 뷰어는 1.1 JSON을 읽을 수 없으므로 배포된 dist/model-viewer.html로 한 번 교체한다. 이후 새 사례에는 JSON만 만든다. 1.0 원본은 유지하며 필요한 경우만 migrate_model.py로 별도 출력에 명시적으로 옮긴다. 구 결과를 자동으로 현재 결과에 결합하지 않는다. Python/뷰어 검사 일치는 audit_integrity.py의 --node 옵션과 check_integrity_viewer.cjs로 확인한다.
