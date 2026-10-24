import { el, add, p, section, facts, references, table } from "./dom.js";

const baselineLabels = { new: "새로 설계하는 모델", design_document: "이전 설계 문서와 비교", production_schema: "운영 데이터 구조와 비교", unknown: "비교할 기준이 아직 없음" };
const areaLabels = { writes: "등록·수정", reads: "조회", contracts: "외부 계약", existing_data: "기존 자료", history: "과거 이력", rollout: "전환", rollback: "복구" };
const statusLabels = { affected: "영향 있음", unaffected: "영향 없음으로 검토", unknown: "영향 미확인" };
const fieldLabels = { id: "식별 코드", name: "이름", title: "제목", label: "표시 이름", description: "설명", role: "모델 역할", grain: "한 줄의 의미", condition: "포함 조건", type: "저장 형식", required: "필수 입력", attributes: "속성", primary_key: "구분 값(PK)", unique_keys: "중복을 막는 조합", constraints: "추가 제약", indexes: "조회 인덱스", from: "연결 출발점", to: "연결 대상", foreign_key: "연결 값(FK)으로 보장", rule: "지켜야 할 조건", enforcement: "보장 위치", display_attributes: "업무 식별 속성", requirement_ids: "연결 요구사항", entity_ids: "연결 모델", decision_ids: "연결 설계 판단", source_ids: "근거 자료" };
const roleLabels = { core: "업무 핵심", supporting: "근거·운영 지원", optional: "조건부 확장" };
function snapshotValue(value, field) {
  if (value === null) return "NULL · 비어 있는 값";
  if (value === "") return '빈 문자열 · ""';
  if (typeof value === "boolean") return value ? "예 (true)" : "아니오 (false)";
  if (field === "role" && Object.hasOwn(roleLabels, value)) return roleLabels[value] + " (" + value + ")";
  return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
}
function changeTarget(change, index) {
  const id = change.relationship_id || change.entity_id, target = index.get(id);
  // Removed targets need not exist in the current model; use only supplied evidence.
  const name = target?.name || target?.title || (change.target_type !== "attribute" && (change.before?.name || change.before?.title));
  const label = id + (name ? ": " + name : "");
  if (change.target_type !== "attribute") return label;
  const attr = target?.attributes.find((a) => a.name === change.attribute_name);
  return label + " / " + change.attribute_name + ": " + (attr?.label || change.before?.label || "표시 이름 미기록");
}
function renderImpact(impact, index) {
  const block = section("변경 영향", facts([["비교 기준", baselineLabels[impact.baseline.kind] || impact.baseline.kind], ["기준의 범위", impact.baseline.description]]));
  block.classList.add("change-impact");
  if (impact.changes.length) {
    add(block, p("아래는 문서에 기록된 항목만 비교합니다. 값이 미기록된 항목은 추가·삭제로 추정하지 않으며, 실제 운영 DB 전체의 차이를 뜻하지 않습니다.", "muted"));
    for (const change of impact.changes) {
      const card = el("article", null, "change-card");
      card.dataset.change = change.id;
      add(card, el("h4", change.id + ": " + { added: "추가", modified: "변경", removed: "제외" }[change.change] + " · " + changeTarget(change, index)), p(change.reason));
      const fields = [...new Set([...Object.keys(change.before || {}), ...Object.keys(change.after || {})])];
      const cell = (snapshot, field, side) => snapshot === null ? (side === "before" ? "추가 전 대상 없음" : "제외 후 대상 없음") : Object.hasOwn(snapshot, field) ? snapshotValue(snapshot[field], field) : "값 미기록 · 판단하지 않음";
      add(card, table(["비교 항목", "변경 전", "변경 후"], fields.map((field) => [Object.hasOwn(fieldLabels, field) ? fieldLabels[field] + " · " + field : field, cell(change.before, field, "before"), cell(change.after, field, "after")])), change.requirement_ids.length ? references(change.requirement_ids, index) : null);
      block.append(card);
    }
  } else block.append(p("개별 항목의 전후 비교는 기록되지 않았습니다.", "muted"));
  if (!impact.areas.length) {
    block.append(p("업무별 변경 영향은 기록되지 않았습니다.", "muted"));
    return block;
  }
  // A shared explanation is shown once; every area's status and targets stay separate.
  const groups = new Map();
  for (const area of impact.areas) {
    if (!groups.has(area.note_id)) groups.set(area.note_id, []);
    groups.get(area.note_id).push(area);
  }
  for (const [noteId, areas] of groups) {
    const note = index.get(noteId), group = el("article", null, "impact-group");
    group.dataset.note = noteId;
    add(group, el("h4", index.label(noteId)), facts([["검토 근거", note?.description || note?.question], ["이유와 영향", note?.impact]]));
    for (const area of areas) {
      const row = add(el("div", null, "impact-area"), el("strong", areaLabels[area.area]), p(statusLabels[area.status], "badge"));
      row.dataset.area = area.area;
      row.dataset.status = area.status;
      add(row, facts([["관련 모델", area.entity_ids.length ? references(area.entity_ids, index) : "기록된 대상 없음"], ["남은 쟁점", area.issue_ids.length ? references(area.issue_ids, index) : "연결된 쟁점 없음"]]));
      group.append(row);
    }
    block.append(group);
  }
  return block;
}
export { renderImpact };
