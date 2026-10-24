# 직접 작성하는 모델 JSON

스킬로 만들거나 JSON을 직접 작성·수정한다. 완전한 시작점은 [example-model.json](example-model.json)이다. 새 사례는 `references/schemas/model-1.1.0.schema.json`을 따른다.

```json
{
  "format": "data-modeling-model",
  "format_version": "1.1.0",
  "review": {"schema_version": "1.1.0", "review_profile": "standard"}
}
```

이 조각은 바깥 구조만 설명하며 완성된 문서가 아니다. review에 목적·범위·요구사항·모델·관계·샘플·확인 상황·설계 이유·근거·미결 사항·실제 제작 과정을 작성한다. 필드와 UI는 [데이터 계약](review-contract.md)을 따른다.

## 새 사례 작성

- 렌더러 핀·체크섬·SQL·실행 보고서 없이 작성할 수 있다. build_metadata도 선택이다.
- 엔터티의 업무용 이름·역할 설명·한 행의 의미·항목 정의를 쓴다. 매 엔터티의 예/질문/위험을 반복할 필요가 없다. 특별한 판단만 insights에 남긴다.
- 엔터티 role은 core/supporting/optional이며, optional에는 inclusion_condition을 적는다.
- 유일성의 실제 범위는 unique_keys의 열 조합으로 적는다. 예: `[["market_account_id","external_product_id"]]`.
- `review.extensions.modeling_review` 1.1에 원자적 규칙·설계/합의 상태·선택지·실제 변경 대상을 연결한다. [설계 검토](design-review.md)를 따른다.
- 시나리오는 상황·기대 동작·확인 이유와 정확한 샘플 PK를 연결한다. 기대 동작을 실제 결과처럼 쓰지 않는다.
- 비식별 예시를 쓰고 긴 식별자는 문자열로 작성한다. 20MB, 깊이 80, 중복 JSON 키/비유한 수/안전 범위 밖 정수는 거부한다.

## 검사 → JSON 정리 → 기존 뷰어

```bash
.venv/bin/python scripts/validate_model.py source.json
.venv/bin/python scripts/build_model.py source.json --output case.model.json
```

생성기는 JSON과 추적용 `.build.json`만 만들며 원본과 업무 내용을 보존한다. 문서의 선택 필드나 미실행을 임의로 바꾸지 않는다. 직접 작성한 파일은 검사 후 그대로 가져올 수도 있다. JSON을 기존 `assets/model-viewer.html`의 가져오기에서 선택하고 네 탭·ERD·속성·설명·샘플을 읽는다. 사례 HTML이나 뷰어를 새로 만들지 않는다.

## 실제 확인 결과가 있을 때

verification 생략/null은 미실행이다. 결과를 기록할 때는 방법·범위·현재 review의 내용 지문을 함께 작성한다. 내용 변경 후 이전 결과가 남으면 생성기와 뷰어가 거부한다. 다시 확인하지 않았다면 결과를 제거하거나 `--clear-verification`으로 별도 JSON을 만든다. [결과 계약](result-integrity.md)에 기록·이전 방법과 검사 한계가 있다.

1.0 JSON은 그대로 읽고 내보낸다. 새 형식이 필요할 때만 migrate_model.py로 원본을 보존해 명시적으로 옮긴다. 오래된 결과를 현재 확인으로 승격하지 않는다. 형식·샘플 검사는 업무 정책 합의나 실제 시스템의 정확성을 증명하지 않는다.
