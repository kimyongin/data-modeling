import fs from "node:fs";
import assert from "node:assert/strict";
import { createWorkspace } from "../viewer/workspace.js";
import { renderReference, renderSpec } from "../viewer/content.js";
import { comparisonTable } from "../viewer/comparison.js";
import { indexDocument } from "../viewer/dom.js";
import { validateDocument } from "../viewer/validation.js";
import { describeError } from "../viewer/errors.js";
import { parse } from "../viewer/json.js";
import { historicalRoleDocument, redundantTargetDocument } from "./change-fixtures.mjs";

const read = (name) => JSON.parse(fs.readFileSync("examples/" + name + ".model.json", "utf8"));
const rowAt = (body, path) => body.querySelectorAll("tbody tr").find((tr) => tr.dataset.path === JSON.stringify(path));
async function runChangeHardeningRegressions(check, dom) {
  await check("valid changed-before role objects, arrays and null survive actual workspace change-history selection", async () => {
    for (const value of [{ toString: null }, { toString: [], valueOf: null }, ["old", "role"], null]) {
      const doc = historicalRoleDocument(read("inventory"), value), original = JSON.stringify(doc), report = await validateDocument(doc);
      const mount = createWorkspace(doc, report, { engine: new Promise(() => {}), onImport() {}, onExport() {}, viewerVersion: "test" });
      dom.body.replaceChildren(mount.root); mount.activate();
      try {
        mount.root.querySelectorAll("button").find((b) => b.textContent === "참조").click();
        mount.root.querySelectorAll("button").find((b) => b.textContent === "설계 변경 기록").click();
        const row = rowAt(mount.root, ["role"]);
        assert(row); assert.equal(row.dataset.state, "changed");
        assert(row.children[1].textContent.includes(value === null ? "NULL" : Array.isArray(value) ? "old" : '"toString"'));
        assert(row.children[2].textContent.includes("업무 핵심"));
        assert.equal(JSON.stringify(doc), original);
      } finally { mount.dispose(); }
    }
    assert.equal(dom.observers(), 0);
  });
  await check("change targets follow entity/attribute/relationship type even if another target ID is supplied", async () => {
    const doc = redundantTargetDocument(read("openmarket"));
    const attribute = doc.change_impact.changes.find((c) => c.target_type === "attribute"), relation = doc.change_impact.changes.find((c) => c.target_type === "relationship");
    attribute.relationship_id = doc.model.relationships[0].id;
    relation.entity_id = doc.model.entities[0].id;
    await validateDocument(doc);
    const body = renderReference(doc, "@changes", indexDocument(doc)), picker = body.querySelector("select");
    for (const change of [doc.change_impact.changes[0], attribute, relation]) {
      picker.value = change.id; picker.emit("change");
      const title = body.querySelector(".change-card").querySelector("h4").textContent;
      const expected = change.target_type === "relationship" ? change.relationship_id : change.entity_id;
      const other = change.target_type === "relationship" ? change.entity_id : change.relationship_id;
      assert(title.includes(expected)); assert(!title.includes(other), title);
    }
  });
  await check("openmarket composite links show field-level changes and business attribute labels with exact key order", () => {
    const doc = read("openmarket"), body = renderReference(doc, "@changes", indexDocument(doc)), picker = body.querySelector("select");
    for (const id of ["CH-08", "CH-09"]) {
      picker.value = id; picker.emit("change");
      const card = body.querySelector(".change-card");
      for (const side of ["from", "to"]) {
        const row = rowAt(card, [side, "attributes"]), change = doc.change_impact.changes.find((c) => c.id === id);
        assert.equal(row.dataset.state, "changed");
        assert.deepEqual(row.children[2].querySelectorAll("li").map((li) => li.querySelector("span").textContent), change.after[side].attributes.map((field) => {
          const entity = doc.model.entities.find((e) => e.id === change.after[side].entity_id);
          return entity.attributes.find((a) => a.name === field).label + " (" + field + ")";
        }));
        assert.equal(row.children[2].querySelectorAll(".comparison-added").length, change.after[side].attributes.length - change.before[side].attributes.length);
        assert.equal(row.children[1].querySelectorAll(".comparison-removed").length, 0);
        assert.equal(rowAt(card, [side, "cardinality"]).dataset.state, "same");
      }
    }
  });
  await check("nested partial snapshots keep unknown distinct from removal and preserve scalar/object type changes", () => {
    const doc = read("inventory"), change = { entity_id: "item", target_type: "entity", before: { nested: { zero: 0, empty: "", nothing: null, old: true }, shape: { toString: null } }, after: { nested: { zero: "0", added: false }, shape: "current" } };
    const body = comparisonTable(change, indexDocument(doc));
    assert.deepEqual(rowAt(body, ["nested", "zero"]).children.slice(1).map((c) => c.textContent), ["0", '"0"']);
    assert.equal(rowAt(body, ["nested", "zero"]).dataset.state, "changed");
    for (const path of [["nested", "empty"], ["nested", "nothing"], ["nested", "old"], ["nested", "added"]]) assert.equal(rowAt(body, path).dataset.state, "unrecorded");
    assert(rowAt(body, ["shape"]).children[1].textContent.includes('"toString": null'));
    assert(!body.textContent.includes("제외된 값")); assert(!body.textContent.includes("추가된 값"));
  });
  await check("array comparisons preserve duplicate counts, typed values and pure order changes", () => {
    const doc = read("inventory"), body = comparisonTable({ before: { values: [1, 1, false, "1", 0], order: ["first", "second"] }, after: { values: [1, true, "1"], order: ["second", "first"] } }, indexDocument(doc));
    const values = rowAt(body, ["values"]);
    assert.deepEqual(values.children[1].querySelectorAll(".comparison-removed").map((li) => li.querySelector("span").textContent), ["1", "아니오 (false)", "0"]);
    assert.deepEqual(values.children[2].querySelectorAll(".comparison-added").map((li) => li.querySelector("span").textContent), ["예 (true)"]);
    assert.equal(rowAt(body, ["order"]).dataset.state, "reordered");
    assert.equal(rowAt(body, ["order"]).querySelectorAll(".comparison-added").length, 0);
    assert.equal(rowAt(body, ["order"]).querySelectorAll(".comparison-removed").length, 0);
  });
  await check("empty and differently shaped snapshots keep every supplied value without guessing unrecorded children", () => {
    const index = indexDocument(read("inventory"));
    for (const [before, after] of [[{ x: {} }, { x: [] }], [{ x: { a: null } }, { x: null }], [{ x: {} }, { x: { a: 1 } }], [null, { x: { a: 1 } }], [{ x: { a: 1 } }, null]]) {
      const body = comparisonTable({ before, after }, index);
      assert(body.querySelectorAll("tbody tr").length);
      assert(!body.textContent.includes("undefined"));
      if (before?.x && !Object.keys(before.x).length) assert(rowAt(body, ["x"]).children[1].textContent.includes("{}"));
      if (before === null) assert.equal(rowAt(body, ["x", "a"]).dataset.state, "added");
      if (after === null) assert.equal(rowAt(body, ["x", "a"]).dataset.state, "removed");
    }
  });
  await check("enum guidance offers real allowed choices with business labels and excludes rejected data", async () => {
    const doc = read("inventory"); doc.model.entities[0].role = "PRIVATE_INVALID_CHOICE";
    await assert.rejects(() => validateDocument(doc), (error) => {
      const message = describeError(error, doc);
      for (const text of ["모델 역할 (role)", "업무 핵심 (core)", "근거·운영 지원 (supporting)", "조건부 확장 (optional)", "다음 중 하나"]) assert(message.includes(text), message);
      assert(!message.includes("PRIVATE_INVALID_CHOICE")); return true;
    });
  });
  await check("parser distinguishes duplicate keys, commas, colons, escapes and trailing commas with exact line/column", () => {
    const cases = [
      ['{\n "a": 1\n "b": 2\n}', 3, 2, "쉼표"],
      ['{\r\n "a":1,\r\n "a":2\r\n}', 3, 2, "중복"],
      ['{"a" 1}', 1, 6, "콜론"],
      ['{"😀":"x\\q"}', 1, 8, "이스케이프"],
      ['{"a":1,\n }', 1, 7, "마지막 항목"],
      ['[1,\n ]', 1, 3, "마지막 목록"],
      ['{"a":"x\\u12z4"}', 1, 12, "16진수"],
      ['{"a":"x\ny"}', 1, 8, "제어 문자"]
    ];
    for (const [source, line, column, reason] of cases) assert.throws(() => parse(source), (error) => {
      assert.equal(error.code, "json_syntax"); assert.equal(error.details.line, line, source); assert.equal(error.details.column, column, source);
      const message = describeError(error);
      assert(message.includes(reason), message); assert(message.includes(line + "행 " + column + "열"), message); return true;
    });
  });
  await check("strict parser preserves valid escapes, Unicode, BOM and nested JSON values", () => {
    const values = [{ escaped: 'quote" slash\\ / \b \f \n \r \t', unicode: "한글 😀", values: [null, 0, false, "", { x: true }] }, [], {}, 0, "string"];
    for (const value of values) {
      const raw = JSON.stringify(value);
      assert.deepEqual(JSON.parse(JSON.stringify(parse(raw))), value);
      assert.deepEqual(JSON.parse(JSON.stringify(parse("\uFEFF" + raw))), value);
    }
    assert.equal(parse('"\\uD83D\\uDE00"'), "😀");
  });
  await check("removed targets with non-string previous names and labels remain readable", async () => {
    const doc = read("inventory");
    doc.change_impact.changes = [{ id: "CH-REMOVED", target_type: "entity", entity_id: "old_entity", change: "removed", before: { name: { toString: null } }, after: null, reason: "변경 전 설계 값의 형식이 달라도 기록을 유지한다.", requirement_ids: [] }];
    await validateDocument(doc);
    const body = renderReference(doc, "@changes", indexDocument(doc));
    assert(rowAt(body, ["name", "toString"]).children[1].textContent.includes("NULL")); assert(body.querySelector("h4").textContent.includes("old_entity"));
  });
  await check("current spec/model stay free of comparisons; separate history shows one change and restores selection", async () => {
    for (const name of ["openmarket", "booking-change", "inventory"]) {
      const doc = read(name), original = JSON.stringify(doc), mount = createWorkspace(doc, await validateDocument(doc), { engine: new Promise(() => {}), onImport() {}, onExport() {}, viewerVersion: "test" });
      dom.body.replaceChildren(mount.root); mount.activate();
      const click = (label) => mount.root.querySelectorAll("button").find((b) => b.textContent === label).click();
      try {
        assert.equal(mount.root.querySelector(".change-impact"), null);
        click("스펙"); assert.equal(mount.root.querySelector(".change-impact"), null);
        assert.equal(renderSpec(doc, "@scope", indexDocument(doc)).querySelector(".change-card"), null);
        click("참조"); click("설계 변경 기록");
        const body = mount.root.querySelector(".record-detail"), picker = body.querySelector("select");
        assert(body.textContent.includes("모든 버전의 누적 이력은 아닙니다"));
        assert.equal(body.querySelectorAll(".change-card").length, Math.min(1, doc.change_impact.changes.length));
        if (picker) {
          const last = doc.change_impact.changes.at(-1).id; picker.value = last; picker.emit("change");
          assert.equal(body.querySelector(".change-card").dataset.change, last);
          click("모델"); click("참조");
          assert.equal(mount.root.querySelector(".change-card").dataset.change, last);
          const search = mount.root.querySelector(".record-list").querySelector("input");
          search.value = doc.change_impact.changes[0].id + " " + doc.change_impact.changes[0].reason.split(/\s+/)[0]; search.emit("input");
          assert(mount.root.querySelector(".record-items").querySelectorAll("button").some((b) => b.dataset.record === "@changes" && !b.hidden));
          assert.equal(mount.root.querySelector(".change-card").dataset.change, last);
        }
        assert.equal(JSON.stringify(doc), original);
      } finally { mount.dispose(); }
    }
    assert.equal(dom.observers(), 0);
  });
}
export { runChangeHardeningRegressions };
