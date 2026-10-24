# 샘플 무결성과 결과의 내용 대응

기본 결과는 JSON이며 SQL이나 검증 전용 탭을 추가하지 않는다. 모델 탭의 기존 확인 사항·설명에서 기대 동작과 실제 확인 결과를 구별한다.

## 자동으로 검사하는 범위

Python 검사기/생성기와 공통 뷰어 가져오기는 같은 JSON Schema 및 대응하는 의미 검사를 사용한다.

- 모든 샘플 행: PK 필수·스칼라·중복 금지, nullable:false의 누락/NULL 금지.
- `unique_keys`: 배열 안의 각 조합이 유일하다. 예: `[["organization_id","code"]]`. 조합에 NULL/미제공 값이 있으면 유일성 비교에서 제외한다. 필수 여부는 nullable로 따로 검사한다.
- `foreign_key:true`: 양끝의 열 순서에 따라 참조한 샘플이 정확히 한 행 있는지 검사한다. NULL이 섞인 참조 조합은 건너뛴다. `foreign_key:false`인 논리 연결은 물리 FK로 검사하지 않는다.
- 모델·규칙·대안·영향 기록의 참조, 결과의 시나리오 목록, 내용 지문을 검사한다.

`columns[].key`의 UQ는 이전 파일의 표시용 힌트다. 이를 전역 단일 열 제약으로 추측하지 않는다. 새 문서는 실제 범위를 unique_keys로 명시한다. 위 NULL/유일성 의미는 샘플 계약이며 특정 DB의 타입 변환·NULL 옵션·CHECK·트리거·잠금·권한을 재현하지 않는다. FK와 PK가 맞아도 기간 겹침이나 집계 정의가 옳다는 뜻은 아니다.

## 선택적인 실제 결과 기록

확인하지 않았으면 verification을 생략/null로 둔다. 결과가 있다면 다음을 작성한다.

- `engine`, `scope`, `executed_at`: 실제 도구/방법, 확인 범위, 실행일.
- `fingerprint_version:"1"`, `input_fingerprint:"sha256:..."`: 현재 review와 결과의 대응.
- `results[]`: 모든 시나리오의 `id,status,message,method,scope`.
- `status`: pass/fail/not_run. method not_run은 status not_run일 때만 쓴다.
- `method`: sample(합성 샘플 대조), simulation(순차 계산 등 처리 예시), implementation(실제 구현 환경 확인), manual(수동 검토), not_run(미실행).

Python 합산은 sample이며 운영 집계 구현 확인이 아니다. 순차 예시는 simulation이며 DB 동시성 확인이 아니다. implementation은 실제 실행 환경과 보장한 범위를 scope에 명시할 수 있을 때만 쓴다. 뷰어는 이 기록을 읽으며 실행하거나 증거를 인증하지 않는다.

내용 지문은 review 전체를 대상으로 한다. 모델·샘플·시나리오·설명·검토 기록을 수정하면 이전 결과를 거부한다. 검사를 실제로 다시 수행한 러너만 마지막에 `model_integrity.review_fingerprint(review)`로 지문을 기록한다. 생성기는 직접 작성 문서에 임의의 성공 결과나 새 지문을 덧붙이지 않는다. 지문은 변경 감지용이며 서명·위조 방지 수단이 아니다.

다시 확인하지 않았다면 verification을 직접 제거하거나 명시적으로 제거한 복사본을 만든다. 이전 원본과 결과는 보존한다.

```bash
.venv/bin/python scripts/build_model.py edited.json --clear-verification --output updated.model.json
```

잘못된 입력은 기존 출력·생성 기록·뷰어의 현재 모델을 교체하지 않는다.

## 이전 파일과 명시적인 이전

1.0 파일은 형식을 유지해 읽고 내보낸다. 결과는 **이전 확인 기록 · 입력 대응 미확인**으로 표시하며 현재 입력에 연결된 구현 확인으로 집계하지 않는다. 이미 잘못된 필수 값/PK/FK 샘플이 있다면 수정할 지점을 알려주고 거부한다.

새 형식으로 옮길 때는 원본을 보존한다. 자동으로 결과를 새 입력에 결합하지 않으며 이전 unbound 결과는 활성 문서에서 제거한다. 이전 결과는 원본에 남는다.

```bash
.venv/bin/python scripts/migrate_model.py old.model.json --output upgraded.model.json
```

이 명령은 기존 출력도 덮어쓰지 않는다. 규칙 기록 1.0은 호환 가능하지만, 새 검토를 수행하면 1.1의 원자적 규칙과 구체 변경 기록으로 작성한다. 내부 실행 자료의 변환은 원본 SHA가 일치하는 보고서만 투영한다. 기존 실행 자료의 통과는 기본적으로 sample이며 임의로 implementation으로 승격하지 않는다.

## 내용 지문 알고리즘 v1

Python/브라우저 숫자 출력과 객체 키 정렬 차이를 피하려고 JSON을 아래 타입 트리로 변환한다.

- null → `["n"]`, bool → `["b",value]`.
- number → `["d",IEEE754 big-endian 64-bit의 소문자 hex]`. -0은 +0으로 정규화하며 비유한 수와 안전 정수 범위를 벗어난 정수는 거부한다.
- string → `["s",UTF-8 바이트의 소문자 hex]`. 잘못된 단독 surrogate는 거부한다.
- array → `["a",변환된 원소 배열]`.
- object → `["o",[[키 UTF-8 hex,변환된 값],...]]`. 키 hex의 오름차순으로 정렬한다.

트리를 공백 없는 ASCII JSON으로 직렬화한 SHA-256 앞에 `sha256:`을 붙인다. 입력은 review 하나이며 verification/build_metadata는 포함하지 않는다. 지문 버전 변경 시 새 계약과 명시적 이전을 제공한다.
