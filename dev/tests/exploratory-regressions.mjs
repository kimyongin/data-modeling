import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { Element } from "./dom-fixture.mjs";
import { createWorkspace } from "../viewer/workspace.js";
import { createGraph } from "../viewer/graph.js";
import { graphScope } from "../viewer/state.js";
import { renderInspector, renderSpec } from "../viewer/content.js";
import { indexDocument } from "../viewer/dom.js";

function fakeSVG(scope) {
  const svg = new Element("svg"), group = new Element("g");
  svg.setAttribute("viewBox", "0 0 800 400");
  svg.append(group);
  for (const entity of scope.entities) {
    const node = new Element("g"), title = new Element("title");
    node.className = "node"; title.textContent = entity.id;
    node.append(title); group.append(node);
  }
  return svg;
}
const click = (root, label) => {
  const button = root.querySelectorAll("button").find((b) => b.textContent === label);
  assert(button, "Missing button: " + label); button.click(); return button;
};
const transform = (stage) => stage.style.transform.match(/translate\(([-\d.]+)px,([-\d.]+)px\) scale\(([-\d.]+)\)/).slice(1).map(Number);

async function runExploratoryRegressions(check, dom, manifest) {
  for (const item of manifest) {
    const doc = JSON.parse(fs.readFileSync(path.resolve(item.input), "utf8"));
    const all = graphScope(doc, { kind: "all" }), domain = graphScope(doc, { kind: "domain", id: doc.model.domains[0].id });
    await check(item.name + " rapid A-B-C-A restores attached SVG and camera rather than loading text", async () => {
      const controller = new AbortController(), graph = createGraph({ engine: Promise.resolve({}), signal: controller.signal, layout: (_, scope) => fakeSVG(scope), onEntity() {}, onRelationship() {} });
      try {
        await graph.show(all, all.entities[0].id); graph.zoomIn();
        const stage = graph.canvas.querySelector(".graph-stage"), originalSVG = stage.firstChild, camera = stage.style.transform;
        const pendingDomain = graph.show(domain, domain.entities[0].id);
        const scenario = graphScope(doc, { kind: "scenario", id: doc.samples.scenarios[0].id });
        const pendingScenario = graph.show(scenario, scenario.entities[0].id);
        await graph.show(all, all.entities[0].id);
        await Promise.all([pendingDomain, pendingScenario]);
        assert.equal(stage.firstChild, originalSVG);
        assert.equal(originalSVG.parentElement, stage);
        assert(stage.querySelector("svg"));
        assert.equal(stage.style.transform, camera);
        await graph.show(domain, domain.entities[0].id);
        assert.equal(stage.querySelectorAll(".node").length, domain.entities.length);
        await graph.show(all, all.entities[0].id);
        assert.equal(stage.firstChild, originalSVG);
        assert.equal(stage.style.transform, camera);
      } finally { controller.abort(); }
    });

    await check(item.name + " failed new layout cannot prevent cached overall recovery or later retry", async () => {
      let fail = true;
      const controller = new AbortController(), graph = createGraph({ engine: Promise.resolve({}), signal: controller.signal, layout: (_, scope) => {
        if (scope.key === domain.key && fail) throw Error("injected layout failure");
        return fakeSVG(scope);
      }, onEntity() {}, onRelationship() {} });
      try {
        await graph.show(all, all.entities[0].id); graph.zoomIn();
        const stage = graph.canvas.querySelector(".graph-stage"), originalSVG = stage.firstChild, camera = stage.style.transform;
        await graph.show(domain, domain.entities[0].id);
        assert(stage.textContent.includes("injected layout failure"));
        await graph.show(all, all.entities[0].id);
        assert.equal(stage.firstChild, originalSVG);
        assert.equal(stage.style.transform, camera);
        fail = false;
        await graph.show(domain, domain.entities[0].id);
        assert(stage.querySelector("svg"));
        assert.equal(stage.querySelectorAll(".node").length, domain.entities.length);
      } finally { controller.abort(); }
    });

    await check(item.name + " check search/status filters retain current review, scroll and query", () => {
      const original = JSON.stringify(doc), mount = createWorkspace(doc, { warnings: [] }, { engine: new Promise(() => {}), onImport() {}, onExport() {}, viewerVersion: "test" });
      const root = mount.root;
      dom.body.replaceChildren(root); mount.activate();
      try {
        click(root, "확인 사항");
        const list = root.querySelector(".nav-list"), input = root.querySelector(".check-filters").querySelector("input"), status = root.querySelector(".check-filters").querySelector("select");
        list.querySelectorAll("button")[0].click();
        const first = doc.samples.scenarios[0], title = root.querySelector(".diagram-toolbar").textContent, detail = root.querySelector(".inspector-body").textContent;
        input.value = "  " + first.id.toLowerCase() + "  " + first.situation.split(/\s+/)[0] + " "; input.emit("input");
        assert(list.querySelectorAll("button").some((b) => b.dataset.item === first.id && !b.hidden));
        assert.equal(root.querySelector(".diagram-toolbar").textContent, title);
        assert.equal(root.querySelector(".inspector-body").textContent, detail);
        input.value = "__NOT_FOUND__"; input.emit("input");
        assert(list.querySelectorAll("button").every((b) => b.hidden));
        assert.equal(root.querySelector(".diagram-toolbar").textContent, title);
        assert.equal(root.querySelector(".inspector-body").textContent, detail);
        assert(root.querySelector(".check-filters").textContent.includes("선택한 항목은 검색 밖"));
        input.value = ""; input.emit("input");
        status.value = "recorded"; status.emit("change");
        const records = new Set(doc.observations.map((o) => o.scenario_id));
        assert.deepEqual(list.querySelectorAll("button").filter((b) => !b.hidden).map((b) => b.dataset.item), doc.samples.scenarios.filter((s) => records.has(s.id)).map((s) => s.id));
        status.value = "unconfirmed"; status.emit("change");
        assert.deepEqual(list.querySelectorAll("button").filter((b) => !b.hidden).map((b) => b.dataset.item), doc.samples.scenarios.filter((s) => !records.has(s.id)).map((s) => s.id));
        list.scrollTop = 130;
        input.value = first.id; input.emit("input");
        click(root, "업무 영역"); click(root, "확인 사항");
        assert.equal(input.value, first.id); assert.equal(status.value, "unconfirmed");
        assert.equal(root.querySelector(".nav-list").scrollTop, 130);
        click(root, "참조"); click(root, "모델");
        assert.equal(input.value, first.id); assert.equal(status.value, "unconfirmed");
        assert.equal(root.querySelector(".diagram-toolbar").textContent, title);
        assert.equal(JSON.stringify(doc), original);
      } finally { mount.dispose(); }
      assert.equal(dom.observers(), 0);
    });

    await check(item.name + " model explanations prioritize scenario rules, keep visible relations and retain full alternatives in spec", () => {
      const original = JSON.stringify(doc), index = indexDocument(doc);
      for (const entity of doc.model.entities) {
        const body = renderInspector(doc, entity.id, "explanation", all, index);
        assert.equal(body.querySelectorAll(".choices").length, 0, "Full comparison belongs in spec");
        const decisions = doc.decisions.filter((d) => d.entity_ids.includes(entity.id) || entity.decision_ids?.includes(d.id));
        for (const decision of decisions) {
          assert(body.textContent.includes(decision.rationale));
          const selected = decision.choices.find((c) => c.id === decision.selected_choice);
          if (selected) assert(body.textContent.includes(selected.cost));
          const spec = renderSpec(doc, decision.requirement_ids.length === 1 ? decision.requirement_ids[0] : "@common", index);
          assert(spec.textContent.includes(decision.choices[0].benefit));
          assert(spec.querySelectorAll(".choices").length > 0);
        }
        const attributes = renderInspector(doc, entity.id, "attributes", all, index);
        for (const relation of doc.model.relationships.filter((r) => [r.from.entity_id, r.to.entity_id].includes(entity.id))) {
          assert(attributes.textContent.includes(relation.rule));
          assert(attributes.textContent.includes(relation.enforcement));
          assert(body.textContent.includes(relation.description));
        }
      }
      const scope = graphScope(doc, { kind: "scenario", id: doc.samples.scenarios[0].id });
      for (const entity of scope.entities) {
        const body = renderInspector(doc, entity.id, "explanation", scope, index);
        const expectedRules = doc.rules.filter((r) => r.entity_ids.includes(entity.id) && r.scenario_ids.includes(scope.scenario.id));
        assert.equal(body.querySelectorAll(".model-rules li").length, expectedRules.length);
        for (const r of expectedRules) assert(body.textContent.includes(r.statement));
        const expectedRelations = scope.relationships.filter((r) => [r.from.entity_id, r.to.entity_id].includes(entity.id));
        assert.equal(body.querySelectorAll(".relationship-card").length, expectedRelations.length);
        assert(body.textContent.includes(scope.scenario.expected_behavior));
      }
      assert.equal(JSON.stringify(doc), original);
    });
  }

  await check("sample dataset and table scroll survive domain/overall selection; explicit selector changes data only", () => {
    const doc = JSON.parse(fs.readFileSync("examples/inventory.model.json", "utf8")), original = JSON.stringify(doc);
    const mount = createWorkspace(doc, { warnings: [] }, { engine: new Promise(() => {}), onImport() {}, onExport() {}, viewerVersion: "test" });
    const root = mount.root; dom.body.replaceChildren(root); mount.activate();
    try {
      click(root, "확인 사항");
      root.querySelector(".nav-list").querySelectorAll("button").find((b) => b.dataset.item === "S-RENAMED").click();
      click(root, "샘플 데이터 보기");
      const select = root.querySelector(".dataset-control").querySelector("select");
      assert.equal(select.value, "DS-RENAMED"); assert.equal(select.disabled, true);
      assert(root.querySelector(".sample-grid").textContent.includes("정보기기"));
      select.value = "DS-BASE"; select.emit("change");
      assert.equal(select.value, "DS-RENAMED", "A check must retain its own dataset and observation context");
      const grid = root.querySelector(".sample-grid"); grid.scrollTop = 120; grid.scrollLeft = 230;
      click(root, "업무 영역");
      root.querySelector(".nav-list").querySelectorAll("button").find((b) => b.dataset.item === "inventory").click();
      assert.equal(select.value, "DS-RENAMED"); assert.equal(select.disabled, false);
      assert(root.querySelector(".sample-grid").textContent.includes("정보기기"));
      assert.deepEqual([root.querySelector(".sample-grid").scrollTop, root.querySelector(".sample-grid").scrollLeft], [120, 230]);
      click(root, "전체 모델");
      assert.equal(select.value, "DS-RENAMED");
      const heading = root.querySelector(".diagram-toolbar").textContent;
      select.value = "DS-BASE"; select.emit("change");
      assert(root.querySelector(".sample-grid").textContent.includes("컴퓨터"));
      assert.equal(root.querySelector(".diagram-toolbar").textContent, heading);
      select.value = "DS-RENAMED"; select.emit("change");
      assert.deepEqual([root.querySelector(".sample-grid").scrollTop, root.querySelector(".sample-grid").scrollLeft], [120, 230]);
      assert.equal(JSON.stringify(doc), original);
    } finally { mount.dispose(); }
    assert.equal(dom.observers(), 0);
  });

  await check("drawer exclusion keeps camera stable, moves minimap above drawer, and explicit fit/mini navigation use uncovered area", async () => {
    const doc = JSON.parse(fs.readFileSync("examples/inventory.model.json", "utf8")), all = graphScope(doc, { kind: "all" }), controller = new AbortController();
    const graph = createGraph({ engine: Promise.resolve({}), signal: controller.signal, layout: (_, scope) => fakeSVG(scope), onEntity() {}, onRelationship() {} });
    try {
      await graph.show(all, "category"); graph.zoomIn();
      const stage = graph.canvas.querySelector(".graph-stage"), before = stage.style.transform;
      graph.setObscuredBottom(340);
      assert.equal(stage.style.transform, before);
      assert.equal(graph.canvas.querySelector(".minimap").style.bottom, "350px");
      click(graph.canvas, "미니맵 열기");
      assert.equal(stage.style.transform, before);
      graph.canvas.querySelector(".graph-legend").offsetHeight = 30;
      graph.fit();
      const [x, y, zoom] = transform(stage), height = graph.canvas.clientHeight - 340;
      assert(y >= 46 && y + 400 * zoom <= height, "Fitted graph must stay below the legend and above the sample drawer");
      const surface = graph.canvas.querySelector(".minimap-surface"), svg = surface.querySelector("svg");
      svg.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } });
      svg.getScreenCTM = () => ({ inverse: () => ({}) });
      surface.emit("pointerdown", { clientX: 100, clientY: 80 });
      assert.deepEqual(transform(stage), [graph.canvas.clientWidth / 2 - 100 * zoom, height / 2 - 80 * zoom, zoom]);
      const moved = stage.style.transform;
      graph.setObscuredBottom(0);
      assert.equal(stage.style.transform, moved);
      assert.equal(graph.canvas.querySelector(".minimap").style.bottom, "10px");
      graph.setObscuredBottom(520);
      assert.equal(surface.style.height, "24px");
      assert.equal(graph.canvas.querySelector(".graph-legend").hidden, true);
      assert.equal(graph.canvas.querySelector(".canvas-hint").hidden, true);
      assert.equal(stage.style.transform, moved);
    } finally { controller.abort(); }
  });
}

export { runExploratoryRegressions };
