# JSON 작성과 동봉 뷰어 사용

설치된 스킬 하나에 지침·JSON 도구·완성된 뷰어가 들어 있다. 새 사례의 결과는 `<사례명>.model.json`이며 사례 HTML이나 뷰어를 다시 만들지 않는다.

## 준비

Python 3.11+의 전용 환경에 스킬의 requirements.txt를 설치한다. 일반 모델링에는 Node나 뷰어 개발 소스가 필요 없다. JSON 도구 버전과 뷰어 버전은 별개이며 모델 형식은 1.1.0이다.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

## 작성 → 검사 → JSON 정리

[직접 작성 안내](model-json.md)와 [완전한 예제](example-model.json)를 읽고 standard 문서를 작성한다. 복잡도·원자적 규칙·대안·변경 영향은 [설계 검토](design-review.md)를 따른다.

```bash
.venv/bin/python scripts/validate_model.py source.json
.venv/bin/python scripts/build_model.py source.json --output case.model.json
```

생성기는 JSON과 `.build.json`만 만들며 원본을 덮어쓰지 않는다. 생성 기록에는 builder_version·입력/출력 해시·의존성·검토 경고를 남긴다. 뷰어 코드·HTML·릴리스 해시는 읽지 않는다. 직접 작성한 JSON을 검사 후 그대로 가져올 수도 있다.

모든 샘플 행의 PK/필수 값/명시한 유일 조합/FK, ID·시나리오·규칙·대안·변경 기록의 연결, 실제 결과와 입력의 내용 대응을 검사한다. 경고 0개를 업무 규칙의 완전성이나 운영 준비로 해석하지 않는다.

## 실제 확인 결과

verification 생략/null은 미실행이다. 결과가 있으면 방법·범위·현재 review의 내용 지문을 기록한다. 내용 변경 후 남은 결과는 거부하며 다시 확인하지 않았다면 명시적으로 제거한다.

```bash
.venv/bin/python scripts/build_model.py edited.json --clear-verification --output updated.model.json
```

샘플 합산과 순차 처리 예시를 DB 제약·API 완전성·동시성 구현 확인으로 쓰지 않는다. 뷰어는 파일에 기록한 결과를 읽으며 실행하거나 인증하지 않는다. [결과 대응 계약](result-integrity.md)을 따른다.

## 동봉 뷰어

설치 폴더의 `assets/model-viewer.html`을 열고 JSON을 가져온다. 완성된 뷰어는 스킬 업데이트에 포함되므로 별도 프로그램 배포가 필요 없다. 데이터는 자동 보관하지 않으며 새로고침하면 빈 뷰어로 돌아간다. JSON을 공유하는 동료도 같은 스킬 패키지의 뷰어를 사용한다.

## 이전 문서

1.0 모델 JSON은 그대로 검사·열기·내보내기가 가능하며 결과는 입력 대응 미확인인 이전 기록으로 표시한다. 새 형식으로 바꿀 때만 원본을 보존해 명시적으로 이전한다.

```bash
.venv/bin/python scripts/migrate_model.py old.model.json --output upgraded.model.json
```

이전 결과는 원본에 남고 새 문서의 활성 결과에서 제거된다. 이미 존재하는 제작용 review-1.0.0 입력과 원본 SHA가 맞는 실행 보고서는 build_model.py의 선택 변환 경로로 JSON에 정리할 수 있다. 이 경로도 SQL을 실행하거나 HTML을 만들지 않는다.

## 스킬·뷰어 유지보수

일반 모델링은 설치 폴더만 사용한다. 사용자가 화면/생성 방식 개선을 요청한 경우 개발 저장소의 dev 도구로 작업하고 완성된 뷰어를 스킬 assets에 빌드해 포함한다. 기존 스키마와 릴리스는 보존한다. JSON 작성·검사 도구가 뷰어 소스나 릴리스 파일을 읽도록 다시 연결하지 않는다. 새 배포본에서도 기존 예제·확인 상태·가져오기/내보내기·동봉 뷰어를 검사한다.
