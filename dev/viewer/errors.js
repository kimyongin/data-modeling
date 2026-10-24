/* User guidance is separate from validator codes, which remain stable for CLI parity. */
const fieldNames = { description: "설명", title: "제목", name: "이름", label: "표시 이름", type: "저장 형식", required: "필수 입력 여부", id: "식별 코드", version: "문서 형식 버전", primary_key: "구분 값(PK)", entity_ids: "연결 모델", requirement_ids: "연결 요구사항", attributes: "기록할 속성", status: "상태", before: "변경 전 값", after: "변경 후 값", role: "모델 역할", design_status: "설계 반영 상태", agreement_status: "업무 합의 상태", target_type: "변경 대상 종류", change: "변경 종류", area: "영향 업무", cardinality: "연결 가능한 개수", method: "확인 방법", kind: "종류", topic: "업무 규칙의 주제" };
const choiceNames = { core: "업무 핵심", supporting: "근거·운영 지원", optional: "조건부 확장", modeled: "설계에 반영", unmodeled: "아직 미반영", excluded: "범위 제외", not_applicable: "해당 없음", proposed: "제안", agreed: "합의", open: "미결", affected: "영향 있음", unaffected: "영향 없음으로 검토", unknown: "미확인", added: "추가", modified: "변경", removed: "제외", entity: "모델", attribute: "속성", relationship: "관계", sample: "샘플 대조", simulation: "가정 시뮬레이션", implementation: "대상 구현 확인", manual: "수동 검토", pass: "확인", fail: "예상과 다름" };
const choiceLabel = (value) => typeof value === "string" && Object.hasOwn(choiceNames, value) ? choiceNames[value] + " (" + value + ")" : JSON.stringify(value);
const collectionNames = { document: "문서 정보", model: "모델", entities: "모델 목록", relationships: "관계 목록", domains: "업무 영역", attributes: "속성 목록", requirements: "요구사항", rules: "업무 규칙", decisions: "설계 판단", issues: "남은 쟁점", sources: "참조 자료", assumptions: "가정", limitations: "제한", samples: "샘플", scenarios: "확인 사항", datasets: "데이터셋", observations: "확인 결과", change_impact: "변경 영향", baseline: "비교 기준", changes: "변경 항목", areas: "업무 영향", rows: "샘플 행" };
const short = (value) => String(value).slice(0, 100);
const label = (field) => Object.hasOwn(fieldNames, field) ? fieldNames[field] + " (" + field + ")" : Object.hasOwn(collectionNames, field) ? collectionNames[field] : short(field);
function errorLocation(doc, path) {
  const parts = path.split("/").filter(Boolean).map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  let value = doc;
  const labels = [];
  for (const part of parts) {
    value = value?.[part];
    if (/^\d+$/.test(part)) {
      const title = value?.label || value?.title || value?.name;
      labels.push(title ? short(title) + (value.id ? " (" + short(value.id) + ")" : "") : Number(part) + 1 + "번째 항목");
    } else labels.push(label(part));
  }
  return labels.join(" → ") || "문서 전체";
}
function semanticLocation(doc, path) {
  if (!doc) return short(path);
  const items = [...doc.requirements, ...doc.rules, ...doc.decisions, ...doc.issues, ...doc.sources, ...doc.model.entities, ...doc.model.relationships, ...doc.model.domains, ...doc.samples.scenarios, ...doc.samples.datasets];
  let entity;
  return path.split("/").map((part) => {
    const item = items.find((item) => item.id === part);
    if (item) {
      if (item.attributes) entity = item;
      return short(item.name || item.title || part) + " (" + part + ")";
    }
    const attr = entity?.attributes.find((a) => a.name === part);
    return attr ? short(attr.label) + " (" + short(part) + ")" : label(part);
  }).join(" → ");
}
const repairs = {
  reference: "연결한 코드가 문서에 없습니다. 대상 항목을 추가하거나 연결 코드를 고쳐 주세요.",
  duplicate_id: "같은 식별 코드가 두 번 쓰였습니다. 서로 다른 항목에는 다른 코드를 써 주세요.",
  attribute_duplicate: "같은 모델 안에 속성 이름이 중복됩니다. 이름을 구분해 주세요.",
  display_attribute: "업무 식별 속성에 적은 이름을 해당 모델의 속성 목록과 맞춰 주세요.",
  key_attribute: "구분 값 또는 유일 조합에 적은 속성이 없습니다. 속성 목록과 이름을 맞춰 주세요.",
  unique_duplicate: "같은 유일 조합이 반복됩니다. 중복 선언을 정리해 주세요.",
  reserved_id: "all은 전체 보기용 코드입니다. 다른 식별 코드를 써 주세요.",
  relationship_endpoint: "관계의 양쪽 모델과 속성이 실제 모델 정의에 있는지 확인해 주세요.",
  foreign_key_arity: "연결 값 양쪽의 속성 개수를 같게 맞춰 주세요.",
  foreign_key_unique: "연결 대상의 속성 조합을 구분 값 또는 유일 조합으로 정의해 주세요.",
  dataset_entity: "샘플에 있는 모델 코드가 모델 정의에 없습니다. 코드를 맞춰 주세요.",
  sample_attribute: "모델에 정의되지 않은 속성이 샘플에 있습니다. 속성 이름을 맞춰 주세요.",
  sample_required: "샘플의 필수 속성 또는 구분 값이 비어 있습니다. 해당 값을 채워 주세요.",
  sample_primary_scalar: "샘플의 구분 값에는 배열이나 객체 대신 단일 값을 넣어 주세요.",
  sample_duplicate: "샘플의 구분 값 또는 유일 조합이 중복됩니다. 각 행을 구분하도록 고쳐 주세요.",
  sample_foreign_key: "샘플의 연결 대상 행을 같은 데이터셋에 추가하거나 연결 값을 고쳐 주세요.",
  scenario_dataset: "확인 사항에 존재하는 데이터셋과 요구사항을 연결해 주세요.",
  sample_reference_entity: "확인 행의 모델을 해당 확인 사항의 연결 모델에도 포함해 주세요.",
  sample_reference_key: "확인 행의 구분 속성 이름과 개수를 모델의 PK와 맞춰 주세요.",
  sample_reference_row: "확인 행을 같은 데이터셋의 한 행에 정확히 대응하도록 고쳐 주세요.",
  rule_coverage: "설계에 반영한 규칙에 요구사항과 이를 다루는 확인 사항을 연결해 주세요.",
  rule_reason: "미반영·제외·해당 없음으로 둔 규칙에는 그 이유를 써 주세요.",
  rule_issue: "미합의·미반영·제외한 규칙에는 남은 쟁점을 연결해 주세요.",
  rule_policy: "합의할 업무 정책은 구현 확인 쟁점과 구분해 기록해 주세요.",
  decision_choice: "설계 판단의 선택지 코드가 중복되지 않고 선택한 안이 목록에 있는지 확인해 주세요.",
  impact_note: "변경 영향의 업무 영역은 한 번만 쓰고 존재하는 가정·제한·쟁점을 근거로 연결해 주세요.",
  impact_target: "영향이 있는 업무 영역에 관련 모델을 연결해 주세요.",
  impact_issue: "영향을 모르는 업무 영역에는 확인할 쟁점을 연결해 주세요.",
  impact_baseline: "비교 기준이 없으면 영향 없음을 확정할 수 없습니다. 기준을 보완하거나 미확인으로 기록해 주세요.",
  change_removed: "제외한 대상은 현재 모델에서 빼고 변경 전 기록을 남기며 변경 후는 null로 써 주세요.",
  change_after: "변경 후 기록을 현재 모델의 같은 항목과 맞춰 주세요.",
  change_before: "추가는 변경 전을 null로, 수정은 비교할 변경 전 값을 기록해 주세요.",
  overview_link: "개요 그림의 코드를 중복 없이 쓰고 존재하는 노드끼리 연결해 주세요.",
  observation_scenario: "확인 결과는 존재하는 확인 사항에 한 번만 기록해 주세요.",
  observation_stale: "확인 결과가 현재 설계·샘플과 맞지 않습니다. 다시 확인한 결과만 갱신하고, 아직 확인하지 않았다면 이전 결과를 제거해 주세요.",
  unsafe_number: "큰 숫자 식별자는 따옴표로 감싼 문자열로 저장해 주세요. 정확한 값을 보존해야 합니다.",
  invalid_unicode: "문자 데이터에 깨진 유니코드가 있습니다. 원문에서 문자를 복원하고 UTF-8 JSON으로 저장해 주세요.",
  depth: "데이터가 너무 깊게 중첩되어 있습니다. 80단계 이내로 정리해 주세요.",
  file_size: "JSON 파일은 20MB 이하여야 합니다. 샘플을 검토에 필요한 분량으로 줄여 주세요."
};
function describeError(error, doc) {
  if (error.userMessage) return error.userMessage;
  const code = error.code || error.message?.split(":", 1)[0];
  if (code === "version") {
    const actual = error.details?.actual;
    return "문서 형식 버전이 " + (typeof actual === "string" ? short(actual) : "없거나 올바르지 않습니다") + (typeof actual === "string" ? "입니다." : ".") + " 이 뷰어는 2.0.0만 지원합니다. 현재 스킬의 예제로 작성하거나 스킬에 2.0.0 형식으로 정리를 요청해 주세요. 버전 숫자만 바꾸면 안 됩니다.";
  }
  if (code === "schema") {
    const { keyword, params = {} } = error.details || {};
    const path = error.path || "/", location = errorLocation(doc, path);
    let instruction;
    if (keyword === "required") instruction = label(params.missingProperty) + " 항목이 빠졌습니다. 해당 항목을 채워 주세요.";
    else if (keyword === "type") instruction = "값의 형식이 다릅니다. " + ({ object: "항목 묶음(객체)", array: "목록(배열)", string: "문자열", boolean: "true 또는 false", number: "숫자", integer: "정수", null: "null" }[params.type] || "정해진 형식") + "으로 써 주세요.";
    else if (keyword === "additionalProperties") instruction = "정의되지 않은 항목 " + label(params.additionalProperty) + "이 있습니다. 오타를 고치거나 현재 문서 형식에 없는 항목을 제거해 주세요.";
    else if (keyword === "enum" || keyword === "const") {
      const values = keyword === "enum" ? params.allowedValues : Object.hasOwn(params, "allowedValue") ? [params.allowedValue] : [];
      instruction = "허용된 값과 다릅니다. " + (values?.length ? "다음 중 하나를 써 주세요: " + values.map(choiceLabel).join(" / ") : "스킬의 현재 예제와 JSON Schema에 정의된 값을 써 주세요.");
    }
    else if (["minLength", "pattern"].includes(keyword)) instruction = "내용이 비어 있거나 정해진 표기와 다릅니다. 의미 있는 내용과 항목별 형식을 확인해 주세요.";
    else if (keyword === "minItems") instruction = "목록 항목이 부족합니다. 최소 " + params.limit + "개를 채워 주세요.";
    else instruction = "현재 문서 형식과 맞지 않습니다. 해당 항목을 스킬의 예제·JSON Schema와 비교해 고쳐 주세요.";
    const field = keyword === "required" ? "/" + params.missingProperty.replace(/~/g, "~0").replace(/\//g, "~1") : "";
    return location + ": " + instruction + " (위치: " + path.replace(/\/$/, "") + field + ")";
  }
  if (Object.hasOwn(repairs, code)) return repairs[code] + (error.path && !["depth", "file_size"].includes(code) ? " (대상: " + semanticLocation(doc, error.path) + ")" : "");
  if (code === "json_syntax" && error.details?.reason) {
    const { reason, line, column, duplicateKey } = error.details;
    return "JSON 문법 오류 · " + line + "행 " + column + "열: " + reason + (duplicateKey !== undefined ? " (중복 항목: " + duplicateKey + ")" : "") + " 수정한 뒤 다시 가져와 주세요.";
  }
  if (code === "json_syntax" || error.name === "SyntaxError") return "JSON 문법을 읽을 수 없습니다. 따옴표·쉼표·괄호와 중복 항목 이름을 확인한 뒤 UTF-8 JSON 파일로 다시 저장해 주세요.";
  if (code === "file_read") return "파일을 읽을 수 없습니다. 파일이 이동·삭제되지 않았는지 확인하고 다시 선택해 주세요.";
  return "파일을 읽거나 화면을 준비하는 중 문제가 생겼습니다. 파일을 다시 선택해 주세요. 계속되면 스킬에서 JSON을 검사해 주세요.";
}
export { describeError };
