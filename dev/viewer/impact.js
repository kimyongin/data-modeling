import { el, add, p, section, facts, references } from "./dom.js";
import { comparisonTable } from "./comparison.js";

const baselineLabels = { new: "새로 설계하는 모델", design_document: "이전 설계 문서와 비교", production_schema: "운영 데이터 구조와 비교", unknown: "비교할 기준이 아직 없음" };
const areaLabels = { writes: "등록·수정", reads: "조회", contracts: "외부 계약", existing_data: "기존 자료", history: "과거 이력", rollout: "전환", rollback: "복구" };
const statusLabels = { affected: "영향 있음", unaffected: "영향 없음으로 검토", unknown: "영향 미확인" };
const changeLabels = { added: "추가", modified: "변경", removed: "제외" };
function changeTarget(change, index) {
  const id = change.target_type === "relationship" ? change.relationship_id : change.entity_id, target = index.get(id);
  // Removed targets need not exist in the current model; use only supplied evidence.
  const name = [target?.name, target?.title, ...(change.target_type !== "attribute" ? [change.before?.name, change.before?.title] : [])].find((value) => typeof value === "string" && value.length);
  const label = id + (name ? ": " + name : "");
  if (change.target_type !== "attribute") return label;
  const attr = target?.attributes?.find((a) => a.name === change.attribute_name);
  const attrLabel = [attr?.label, change.before?.label].find((value) => typeof value === "string" && value.length) || "표시 이름 미기록";
  return label + " / " + change.attribute_name + ": " + attrLabel;
}
function renderImpact(impact, index, { selectedId, onSelect = () => {} } = {}) {
  const block = section("변경 영향", facts([["비교 기준", baselineLabels[impact.baseline.kind] || impact.baseline.kind], ["기준의 범위", impact.baseline.description]]));
  block.classList.add("change-impact");
  if (impact.changes.length) {
    add(block, p("아래는 문서에 기록된 항목만 비교합니다. 값이 미기록된 항목은 추가·삭제로 추정하지 않으며, 실제 운영 DB 전체의 차이를 뜻하지 않습니다.", "muted"));
    const cards = new Map();
    for (const change of impact.changes) {
      const card = el("article", null, "change-card");
      card.dataset.change = change.id;
      add(card, el("h4", change.id + ": " + changeLabels[change.change] + " · " + changeTarget(change, index)), p(change.reason));
      add(card, comparisonTable(change, index), change.requirement_ids.length ? references(change.requirement_ids, index) : null);
      cards.set(change.id, card);
    }
    const detail = el("div", null, "change-detail"), selected = cards.has(selectedId) ? selectedId : impact.changes[0].id;
    if (impact.changes.length > 1) {
      const picker = el("select");
      picker.setAttribute("aria-label", "설계 변경 항목 선택");
      for (const change of impact.changes) {
        const option = el("option", change.id + ": " + changeTarget(change, index) + " · " + changeLabels[change.change]);
        option.value = change.id; picker.append(option);
      }
      picker.value = selected;
      picker.addEventListener("change", () => {
        if (!cards.has(picker.value)) return;
        detail.replaceChildren(cards.get(picker.value));
        onSelect(picker.value);
      });
      block.append(add(el("label", null, "change-picker"), el("span", "검토할 변경 항목 · " + impact.changes.length + "개 중 하나씩 보기"), picker));
    }
    detail.append(cards.get(selected));
    block.append(detail);
    block.dataset.searchText = [...cards.values()].map((card) => card.textContent).join(" ");
  } else block.append(p("개별 항목의 전후 비교는 기록되지 않았습니다.", "muted"));
  if (!impact.areas.length) {
    block.append(p("업무별 변경 영향은 기록되지 않았습니다.", "muted"));
    return block;
  }
  // A shared explanation is shown once; every area's status and targets stay separate.
  add(block, el("h4", "이번 변경 전체의 업무 영향"), p("아래는 이번 설계 변경 전체에 대한 업무 영향 검토입니다.", "muted"));
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
