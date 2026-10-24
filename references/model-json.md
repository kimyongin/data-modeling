# 직접 작성하는 모델 JSON

직접 작성해도 되고 data-modeling 스킬이 조사·설계한 내용을 이 형식으로 작성해도 된다. 동료에게 받은 파일만 읽는 형식이 아니다. 완전한 시작점은 [example-model.json](example-model.json)이며 복사한 뒤 업무 내용과 연결 ID를 수정한다.

문서의 최상위에는 다음 3개 항목이 필수다. 실제 review의 모든 필드는 예제와 `schemas/model-1.0.0.schema.json`을 따른다.

```json
{
  "format": "data-modeling-model",
  "format_version": "1.0.0",
  "review": {
    "schema_version": "1.0.0",
    "review_profile": "standard"
  }
}
```

이 짧은 조각은 바깥 구조 설명일 뿐 완성된 입력이 아니다. review에는 제목·목적·범위·요구사항·모델·관계·샘플·확인할 상황과 판단 이유/근거/남은 쟁점/제작 과정을 채운다. 엔터티와 관계의 ID, 어떤 속성으로 연결하는지, 확인할 상황과 샘플 PK의 대응이 정확해야 한다. 요구사항/설계 이유/참조 ID도 일치시킨다. 샘플에는 비식별 예시를 쓰고 긴 식별자는 문자열로 작성한다.

**직접 작성에 renderer_version·체크섬·생성 해시·SQL·expected는 필요 없다.** verification을 생략하거나 null로 두면 확인 사항은 모두 미실행이다. 선택적인 verification은 예시의 결과 설명이며 실제로 수행한 결과만 기록한다. 뷰어는 파일에 기록된 내용을 읽을 뿐 DB를 실행하지 않는다. 모델·샘플을 수정하면 기존 verification을 제거해 미실행으로 돌리거나, 다시 확인한 결과로 갱신한다. build_metadata는 생성기가 붙이는 선택 추적 정보이며 직접 작성자는 넣을 필요가 없다.

검사한 JSON을 기존 공통 뷰어의 가져오기에서 선택한다. JSON을 고친 뒤에는 다시 가져오면 된다. HTML이나 뷰어를 새로 만들지 않는다.

```bash
.venv/bin/python <skill-dir>/scripts/validate_review.py reservation.model.json
```

파일 정리와 생성 기록이 필요하면 같은 내용의 JSON을 별도 경로로 만든다. 원래 입력 파일은 덮어쓰지 않는다.

```bash
.venv/bin/python <skill-dir>/scripts/build_model.py source.json --output reservation.model.json
```

기존 제작용 review.json에 SQL 실행 시나리오가 있는 경우에만 실행 보고서를 선택적으로 연결한다. 생성기는 실행 코드·원시 결과를 제거하고 뷰어가 읽을 모델 JSON을 직접 만든다. HTML을 거쳐 내보낼 필요가 없다.

```bash
.venv/bin/python <skill-dir>/scripts/build_model.py review.json --verification verification.json --output reservation.model.json
```

파일은 최대 20MB이며 중복 JSON 키·잘못된 연결·알 수 없는 필드·정확히 표현할 수 없는 큰 정수·누락된 standard 설명은 검사에서 거부한다. 형식 검사는 업무 규칙의 정확성이나 운영 준비를 증명하지 않는다.

## 설계 검토 기록

새 사례는 [설계 검토](design-review.md)에 따라 `review.extensions.modeling_review`를 작성한다. 복잡도·대안·규칙 누락·변경 영향의 연결을 검사하고 생성 기록의 `design_review`에 경고를 남긴다. 기존 뷰어·모델 1.0.0 계약은 유지하며 사례마다 HTML을 만들지 않는다. 업무 설명 원문은 기존 결정·미결 사항·전제에 한 번 작성하고 [설명 작성](report-writing.md)에 따라 중복을 줄인다. 이 검토 기록이나 경고 0개는 실제 실행 통과를 뜻하지 않는다.
