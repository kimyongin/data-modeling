# 직접 작성하는 모델 JSON

완전한 시작점은 [example-model.json](example-model.json), 정본은 [JSON Schema](schemas/model-2.0.0.schema.json)다. 새 사례는 데이터만 작성한다.

```json
{
  "format": "data-modeling-model",
  "version": "2.0.0",
  "document": {},
  "requirements": [],
  "rules": [],
  "decisions": [],
  "issues": [],
  "model": {"entities": [], "relationships": [], "domains": []},
  "samples": {"datasets": [], "scenarios": []},
  "observations": [],
  "sources": [],
  "assumptions": [],
  "limitations": [],
  "change_impact": {}
}
```

이 조각은 구성 안내이며 완성된 입력이 아니다. 예제를 복사해 실제 요구·모델·샘플을 바꾼다. 엔터티 정의에 행을 넣거나 화면 배치·선택 상태를 저장하지 않는다. 확인하지 않은 결과는 작성하지 않는다.

```bash
python scripts/validate_model.py source.json
python scripts/build_model.py source.json --output cases/example.model.json
```

검사 결과에는 오류와 업무 검토 경고를 구분한다. 생성기는 원본을 유지하고 결과 JSON과 `.build.json` 기록만 만든다. 생성 기록을 함께 검사하려면 `validate_model.py cases/example.model.json --receipt cases/example.model.build.json`을 사용한다. 직접 작성 파일은 생성 기록 없이도 뷰어에서 열린다.

현재 JSON을 직접 수정한 후 다시 검사·가져오기한다. 실제 확인을 다시 하지 않았다면 오래된 결과를 제거한다. 명시적으로 제거한 복사본에는 `build_model.py edited.json --clear-observations --output updated.model.json`을 쓴다. 입력 파일과 기존 결과를 그대로 보존한다.

뷰어는 설치 폴더의 `assets/model-viewer.html`이다. 가져오기·내보내기는 직접 작성·스킬 생성·동료 공유에 같은 계약을 적용한다. 문서는 최대 20MB, 깊이 80이며 중복 JSON 키·비유한 수·안전 범위를 벗어나는 정수·잘못된 유니코드를 거부한다. 큰 식별자는 문자열로 쓴다.
