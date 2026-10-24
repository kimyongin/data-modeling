import { el, add, p, table } from "./dom.js";
import { key } from "./fingerprint.js";

const missing = Symbol("unrecorded"), absent = Symbol("no target");
const fieldLabels = { id: "식별 코드", name: "이름", title: "제목", label: "표시 이름", description: "설명", role: "모델 역할", grain: "한 줄의 의미", condition: "포함 조건", type: "저장 형식", required: "필수 입력", attributes: "속성", primary_key: "구분 값(PK)", unique_keys: "중복을 막는 조합", constraints: "추가 제약", indexes: "조회 인덱스", from: "연결 출발점", to: "연결 대상", entity_id: "모델", cardinality: "연결 가능한 개수", foreign_key: "연결 값(FK)으로 보장", rule: "지켜야 할 조건", enforcement: "보장 위치", display_attributes: "업무 식별 속성", requirement_ids: "연결 요구사항", entity_ids: "연결 모델", decision_ids: "연결 설계 판단", source_ids: "근거 자료" };
const roleLabels = { core: "업무 핵심", supporting: "근거·운영 지원", optional: "조건부 확장" };
const cardinalityLabels = { "1": "반드시 한 건", "0..1": "없거나 한 건", "0..N": "없거나 여러 건", "1..N": "한 건 이상" };
const states = { added: "추가", removed: "제외", changed: "값 변경", reordered: "순서 변경", same: "같은 값", unrecorded: "일부 값 미기록" };
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const unknown = (value) => value === missing || value === absent;
const child = (value, name) => unknown(value) ? value : Object.hasOwn(value, name) ? value[name] : missing;
function comparisonRows(change) {
  const rows = [];
  function walk(path, before, after) {
    if ((object(before) || object(after)) && (object(before) || unknown(before)) && (object(after) || unknown(after))) {
      const fields = [...new Set([...Object.keys(object(before) ? before : {}), ...Object.keys(object(after) ? after : {})])];
      const emptyObject = [before, after].some((value) => object(value) && !Object.keys(value).length);
      if (fields.length && !emptyObject) {
        for (const field of fields) walk([...path, field], child(before, field), child(after, field));
        return;
      }
    }
    if (!path.length) return;
    let state = before === absent ? "added" : after === absent ? "removed" : before === missing || after === missing ? "unrecorded" : key(before) === key(after) ? "same" : "changed";
    if (state === "changed" && Array.isArray(before) && Array.isArray(after) && key(before.map(key).sort()) === key(after.map(key).sort())) state = "reordered";
    rows.push({ path, before, after, state });
  }
  walk([], change.before === null ? absent : change.before, change.after === null ? absent : change.after);
  return rows;
}
function readPath(value, path) {
  for (const part of path) value = value?.[part];
  return value;
}
function scalarLabel(value, path, snapshot, change, index) {
  if (value === null) return "NULL · 비어 있는 값";
  if (value === "") return '빈 문자열 · ""';
  if (typeof value === "boolean") return value ? "예 (true)" : "아니오 (false)";
  const field = path.at(-1);
  if (field === "role" && typeof value === "string" && Object.hasOwn(roleLabels, value)) return roleLabels[value] + " (" + value + ")";
  if (field === "cardinality" && typeof value === "string" && Object.hasOwn(cardinalityLabels, value)) return cardinalityLabels[value] + " (" + value + ")";
  if (field === "entity_id" && typeof value === "string" && index.get(value)) return index.label(value);
  if (["requirement_ids", "entity_ids", "decision_ids", "source_ids"].includes(field) && typeof value === "string" && index.get(value)) return index.label(value);
  if (["attributes", "primary_key", "display_attributes"].includes(field) && typeof value === "string") {
    const parent = readPath(snapshot, path.slice(0, -1)), entityId = parent?.entity_id || (change.target_type === "entity" ? change.entity_id : null);
    const attribute = index.get(entityId)?.attributes?.find((a) => a.name === value);
    if (attribute) return attribute.label + " (" + value + ")";
  }
  return typeof value === "object" ? JSON.stringify(value, null, 2) : typeof value === "string" ? JSON.stringify(value) : String(value);
}
function valueCell(value, other, path, snapshot, change, index, side) {
  if (value === absent) return p(side === "before" ? "추가 전 대상 없음" : "제외 후 대상 없음", "muted");
  if (value === missing) return p("값 미기록 · 판단하지 않음", "muted");
  if (!Array.isArray(value)) return p(scalarLabel(value, path, snapshot, change, index));
  if (!value.length) return p("빈 목록 · []");
  const list = el("ol", null, "comparison-values"), counts = new Map();
  const comparable = Array.isArray(other) || other === absent;
  for (const item of Array.isArray(other) ? other : []) counts.set(key(item), (counts.get(key(item)) || 0) + 1);
  for (const item of value) {
    const token = key(item), remaining = counts.get(token) || 0;
    if (remaining) counts.set(token, remaining - 1);
    const changed = comparable && !remaining, itemClass = changed ? side === "before" ? "comparison-removed" : "comparison-added" : "";
    list.append(add(el("li", null, itemClass), el("span", scalarLabel(item, path, snapshot, change, index)), changed ? el("span", side === "before" ? "제외된 값" : "추가된 값", "badge") : null));
  }
  return list;
}
function comparisonTable(change, index) {
  const rows = comparisonRows(change);
  const grid = table(["비교 항목", "변경 전", "변경 후"], rows.map((row) => [
    add(el("div"), el("strong", row.path.map((part) => part === "attributes" && ["from", "to"].includes(row.path[0]) ? "연결 속성" : Object.hasOwn(fieldLabels, part) ? fieldLabels[part] : part).join(" → ")), p(row.path.join("."), "code"), p(states[row.state], "badge")),
    valueCell(row.before, row.after, row.path, change.before, change, index, "before"),
    valueCell(row.after, row.before, row.path, change.after, change, index, "after")
  ]));
  grid.classList.add("comparison-table");
  grid.querySelectorAll("tbody tr").forEach((tr, i) => {
    tr.dataset.state = rows[i].state;
    tr.dataset.path = JSON.stringify(rows[i].path);
  });
  return grid;
}
export { comparisonRows, comparisonTable };
