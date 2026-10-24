import fs from "node:fs";
import assert from "node:assert/strict";
import { createWorkspace } from "../viewer/workspace.js";
import { renderReference } from "../viewer/content.js";
import { renderImpact } from "../viewer/impact.js";
import { indexDocument } from "../viewer/dom.js";
import { matchesQuery } from "../viewer/search.js";
import { describeError } from "../viewer/errors.js";
import { validateDocument } from "../viewer/validation.js";

const click = (root, label) => {
  const button = root.querySelectorAll("button").find((b) => b.textContent === label);
  assert(button, "Missing button: " + label); button.click();
};
async function runReviewRegressions(check, dom, manifest) {
  for (const item of manifest) {
    const doc = JSON.parse(fs.readFileSync(item.input, "utf8"));
    await check(item.name + " change evidence retains every snapshot, area state, target and issue without mutating JSON", () => {
      const original = JSON.stringify(doc), body = renderReference(doc, "@changes", indexDocument(doc));
      assert.equal(body.querySelectorAll(".change-card").length, Math.min(1, doc.change_impact.changes.length));
      const picker = body.querySelector("select");
      for (const change of doc.change_impact.changes) {
        if (picker) { picker.value = change.id; picker.emit("change"); }
        const card = body.querySelector(".change-card");
        assert.equal(card.dataset.change, change.id);
        assert(card.textContent.includes("변경 전")); assert(card.textContent.includes("변경 후"));
        assert(card.textContent.includes(change.reason));
        for (const field of new Set([...Object.keys(change.before || {}), ...Object.keys(change.after || {})])) assert(card.querySelectorAll("tbody tr").some((tr) => JSON.parse(tr.dataset.path)[0] === field));
      }
      for (const area of doc.change_impact.areas) {
        const row = body.querySelectorAll(".impact-area").find((a) => a.dataset.area === area.area);
        assert.equal(row.dataset.status, area.status);
        for (const id of [...area.entity_ids, ...area.issue_ids]) assert(row.textContent.includes(indexDocument(doc).label(id)));
      }
      const groups = body.querySelectorAll(".impact-group");
      assert.equal(groups.length, new Set(doc.change_impact.areas.map((a) => a.note_id)).size);
      for (const group of groups) {
        const note = indexDocument(doc).get(group.dataset.note);
        const prose = note.description || note.impact || note.question;
        assert.equal(group.textContent.split(prose).length - 1, 1);
      }
      assert.equal(JSON.stringify(doc), original);
    });
    await check(item.name + " spec/reference multiword search matches check-search rules while preserving selection and scroll", () => {
      const mount = createWorkspace(doc, { warnings: [] }, { engine: new Promise(() => {}), onImport() {}, onExport() {}, viewerVersion: "test" });
      const root = mount.root; dom.body.replaceChildren(root); mount.activate();
      try {
        for (const tab of ["스펙", "참조"]) {
          click(root, tab);
          const items = root.querySelector(".record-items"), buttons = items.querySelectorAll("button");
          const chosen = tab === "스펙" ? buttons.find((b) => b.dataset.record === doc.requirements[0].id) : buttons.find((b) => b.dataset.record === "@glossary");
          chosen.click();
          const detail = root.querySelector(".record-detail"), expected = detail.textContent, query = tab === "스펙" ? doc.requirements[0].id.toLowerCase() + "\t" + doc.requirements[0].title.split(/\s+/).at(-1) : "  PK \n 뜻  ";
          detail.scrollTop = 123;
          const input = root.querySelector(".record-list").querySelector("input");
          input.value = "  " + query + "  "; input.emit("input");
          assert.equal(chosen.hidden, false); assert.equal(chosen.getAttribute("aria-pressed"), "true");
          assert.equal(detail.textContent, expected); assert.equal(detail.scrollTop, 123);
          for (const b of buttons) assert.equal(!b.hidden, matchesQuery(b.dataset.search, input.value));
          input.value = "___NO_MATCH___"; input.emit("input");
          assert(buttons.every((b) => b.hidden)); assert(detail.textContent.includes("검색 결과가 없습니다."));
          input.value = query; input.emit("input");
          assert.equal(chosen.hidden, false);
        }
      } finally { mount.dispose(); }
      assert.equal(dom.observers(), 0);
    });
    await check(item.name + " schema error identifies missing field and candidate business labels with stable machine code", async () => {
      const broken = structuredClone(doc), entity = broken.model.entities[0], attr = entity.attributes[0];
      delete attr.description;
      await assert.rejects(() => validateDocument(broken), (error) => {
        assert.equal(error.code, "schema"); assert.equal(error.message.split(":", 1)[0], "schema");
        assert.equal(error.details.keyword, "required"); assert.equal(error.details.params.missingProperty, "description");
        const message = describeError(error, broken);
        for (const text of [entity.name, attr.label, "설명 (description)", "/model/entities/0/attributes/0/description", "채워 주세요"]) assert(message.includes(text), message);
        assert(!message.includes("schema:")); return true;
      });
    });
  }
  await check("partial before/after snapshots distinguish absent targets, missing fields, false, zero, empty text and null", () => {
    const doc = JSON.parse(fs.readFileSync("examples/inventory.model.json", "utf8")), entity = doc.model.entities[0];
    const impact = { baseline: { kind: "production_schema", description: "검토용 비교 기준" }, areas: [], changes: [
      { id: "CH-ADD", target_type: "entity", entity_id: entity.id, change: "added", before: null, after: { id: entity.id }, reason: "추가 이유", requirement_ids: [] },
      { id: "CH-MOD", target_type: "attribute", entity_id: entity.id, attribute_name: entity.attributes[0].name, change: "modified", before: { required: false, count: 0, description: "", condition: null, old_only: "전 기록" }, after: { required: true, new_only: "후 기록", nested: { state: "kept" } }, reason: "변경 이유", requirement_ids: [] },
      { id: "CH-REMOVE", target_type: "entity", entity_id: "old_model", change: "removed", before: { name: "이전 모델" }, after: null, reason: "제외 이유", requirement_ids: [] },
      { id: "CH-REL", target_type: "relationship", relationship_id: "old_relation", change: "removed", before: { title: "이전 관계" }, after: null, reason: "관계 제외 이유", requirement_ids: [] }
    ] };
    const body = renderImpact(impact, indexDocument(doc)), picker = body.querySelector("select");
    let text = "";
    for (const change of impact.changes) { picker.value = change.id; picker.emit("change"); text += body.textContent; }
    for (const term of ["운영 데이터 구조와 비교", "변경 전", "변경 후", "아니오 (false)", "0", '빈 문자열 · ""', "NULL · 비어 있는 값", "추가 전 대상 없음", "제외 후 대상 없음", "값 미기록 · 판단하지 않음", "old_model: 이전 모델", "old_relation: 이전 관계", "nested.state", '"kept"', "전체의 차이를 뜻하지 않습니다"]) assert(text.includes(term), term);
    assert(!text.includes("대상 미확인"));
    picker.value = "CH-MOD"; picker.emit("change");
    const rows = body.querySelector(".change-card").querySelectorAll("tbody tr");
    assert.deepEqual(rows.find((r) => r.dataset.path === '["count"]').children.map((c) => c.textContent).slice(1), ["0", "값 미기록 · 판단하지 않음"]);
    assert.deepEqual(rows.find((r) => r.children[0].textContent.includes("required")).children.map((c) => c.textContent).slice(1), ["아니오 (false)", "예 (true)"]);
  });
  await check("all impact states remain distinct even with a shared note and absent targets", () => {
    const doc = JSON.parse(fs.readFileSync("examples/booking-change.model.json", "utf8")), impact = structuredClone(doc.change_impact);
    impact.baseline.kind = "design_document";
    impact.areas[0].status = "affected"; impact.areas[1].status = "unaffected"; impact.areas[1].entity_ids = [];
    const body = renderImpact(impact, indexDocument(doc)), text = body.textContent;
    for (const term of ["영향 있음", "영향 없음으로 검토", "영향 미확인", "기록된 대상 없음"]) assert(text.includes(term));
    assert.equal(body.querySelectorAll(".impact-group").length, 1);
    assert.equal(body.querySelectorAll(".impact-area").length, 7);
  });
  await check("shared literal search normalizes case, NFC and whitespace, never treating punctuation as regex", () => {
    assert(matchesQuery("R-01: 통합 상품 조회", " 조회\n r-01   "));
    assert(matchesQuery("카페 Café", "cafe\u0301 카페"));
    assert(matchesQuery("literal [x]", "[x]")); assert(!matchesQuery("literal x", "[x]"));
    assert(matchesQuery("anything", " \t \n")); assert(!matchesQuery("one", "one two"));
  });
  await check("schema guidance covers wrong types, unexpected fields, enum values and empty lists without raw data", async () => {
    const base = JSON.parse(fs.readFileSync("examples/inventory.model.json", "utf8"));
    for (const [mutate, phrase] of [
      [(d) => { d.model.entities[0].attributes = "PRIVATE_VALUE"; }, "목록(배열)"],
      [(d) => { d.document.extra = "PRIVATE_VALUE"; }, "정의되지 않은 항목"],
      [(d) => { d.model.entities[0].role = "PRIVATE_VALUE"; }, "허용된 값"],
      [(d) => { d.model.entities = []; }, "최소 1개"]
    ]) {
      const broken = structuredClone(base); mutate(broken);
      await assert.rejects(() => validateDocument(broken), (error) => {
        const message = describeError(error, broken);
        assert(message.includes(phrase), message); assert(!message.includes("PRIVATE_VALUE")); return true;
      });
    }
    const version = structuredClone(base); version.version = "1.1.0";
    await assert.rejects(() => validateDocument(version), (error) => {
      const message = describeError(error, version);
      assert(message.includes("1.1.0")); assert(message.includes("2.0.0")); assert(message.includes("숫자만 바꾸면 안 됩니다")); return true;
    });
  });
  await check("semantic error guidance gives readable model/attribute context and hides internal exception details", async () => {
    const doc = JSON.parse(fs.readFileSync("examples/inventory.model.json", "utf8"));
    doc.samples.datasets[0].rows.item[0].id = null;
    await assert.rejects(() => validateDocument(doc), (error) => {
      assert.equal(error.code, "sample_required");
      const message = describeError(error, doc);
      assert(message.includes("필수 속성")); assert(message.includes("비품")); assert(message.includes("구분")); return true;
    });
    assert(!describeError(Object.assign(Error("depth: Maximum nesting is 80"), { code: "depth", path: "Maximum nesting is 80" })).includes("Maximum"));
    assert(!describeError(Error("PRIVATE_INTERNAL_EXCEPTION")).includes("PRIVATE_INTERNAL_EXCEPTION"));
    assert(describeError({ code: "unsafe_number" }).includes("문자열"));
    assert(describeError({ code: "invalid_unicode" }).includes("UTF-8"));
  });
}
export { runReviewRegressions };
