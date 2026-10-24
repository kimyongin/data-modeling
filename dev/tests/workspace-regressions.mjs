import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { Element } from "./dom-fixture.mjs";
import { createWorkspace } from "../viewer/workspace.js";
import { renderSamples } from "../viewer/content.js";
import { referenceRow, sampleLabel } from "../viewer/samples.js";
import { createGraph } from "../viewer/graph.js";
import { graphScope } from "../viewer/state.js";

const findButton = (root, label) => root.querySelectorAll("button").find((b) => b.textContent === label);
const click = (root, label) => {
  const b = findButton(root, label);
  assert(b, "Missing button: " + label);
  b.click();
  return b;
};

async function runRegressions(check, dom, manifest) {
  for (const item of manifest) {
    const doc = JSON.parse(fs.readFileSync(path.resolve(item.input), "utf8"));
    async function withWorkspace(fn) {
      const original = JSON.stringify(doc);
      const mount = createWorkspace(doc, { warnings: [] }, { engine: new Promise(() => {}), onImport() {}, onExport() {}, viewerVersion: "test" });
      const root = mount.root, workspace = root.querySelector(".workspace"), canvas = root.querySelector(".graph-canvas");
      workspace.clientWidth = 1800;
      canvas.clientHeight = 700;
      dom.body.replaceChildren(root);
      mount.activate();
      try { await fn(root, workspace, canvas); }
      finally { mount.dispose(); }
      assert.equal(JSON.stringify(doc), original, "UI must not mutate the authored JSON");
      assert.equal(dom.observers(), 0);
    }

    await check(item.name + " preferred panel/drawer sizes survive viewport constraints and tab changes", () => withWorkspace((root, workspace, canvas) => {
      const [left, right] = root.querySelectorAll(".panel-resizer");
      left.emit("keydown", { key: "ArrowRight", shiftKey: true });
      right.emit("keydown", { key: "End" });
      click(root, "샘플 데이터 보기");
      const handle = root.querySelector(".drawer-resizer"), drawer = root.querySelector(".sample-drawer");
      handle.emit("keydown", { key: "End" });
      const before = [workspace.style["--left-width"], workspace.style["--right-width"], drawer.style.height];
      workspace.clientWidth = 1000;
      canvas.clientHeight = 240;
      dom.resize();
      assert.notEqual(workspace.style["--right-width"], before[1]);
      assert(parseFloat(drawer.style.height) <= 160);
      workspace.clientWidth = 1800;
      canvas.clientHeight = 700;
      dom.resize();
      assert.deepEqual([workspace.style["--left-width"], workspace.style["--right-width"], drawer.style.height], before);
      click(root, "스펙"); click(root, "모델");
      assert.deepEqual([workspace.style["--left-width"], workspace.style["--right-width"], drawer.style.height], before);
      right.emit("pointerdown", { button: 0, pointerId: 2, clientX: 100 });
      right.emit("pointermove", { pointerId: 2, clientX: 160 });
      right.emit("pointerup", { pointerId: 2 });
      assert.equal(parseFloat(workspace.style["--right-width"]), parseFloat(before[1]) - 60);
      const leftBefore = parseFloat(workspace.style["--left-width"]);
      left.emit("pointerdown", { button: 0, pointerId: 3, clientX: 100 });
      left.emit("pointermove", { pointerId: 3, clientX: 140 });
      left.emit("pointerup", { pointerId: 3 });
      assert.equal(parseFloat(workspace.style["--left-width"]), leftBefore + 40);
      handle.emit("keydown", { key: "Home" });
      handle.emit("pointerdown", { button: 0, pointerId: 4, clientY: 400 });
      handle.emit("pointermove", { pointerId: 4, clientY: 350 });
      handle.emit("pointerup", { pointerId: 4 });
      assert.equal(parseFloat(drawer.style.height), 200);
      for (const h of [left, right, handle]) {
        assert(document.getElementById(h.getAttribute("aria-controls")));
        assert(Number(h.getAttribute("aria-valuenow")) >= Number(h.getAttribute("aria-valuemin")));
        assert(Number(h.getAttribute("aria-valuenow")) <= Number(h.getAttribute("aria-valuemax")));
      }
      for (const h of [left, right, handle]) h.emit("keydown", { key: "Enter" });
      assert.deepEqual([workspace.style["--left-width"], workspace.style["--right-width"], drawer.style.height], ["220px", "400px", "336px"]);
    }));

    await check(item.name + " spec search includes linked design and clears unrelated empty-result content", () => withWorkspace((root) => {
      click(root, "스펙");
      const list = root.querySelector(".record-items"), input = root.querySelector(".record-list").querySelector("input");
      const decision = doc.decisions.find((d) => d.requirement_ids.length);
      assert(decision);
      input.value = decision.rationale;
      input.emit("input");
      assert(list.querySelectorAll("button").some((b) => b.dataset.record === decision.requirement_ids[0] && !b.hidden));
      assert(root.querySelector(".record-detail").textContent.includes(decision.rationale));
      input.value = "__NO_MATCH_71c95__";
      input.emit("input");
      assert(list.querySelectorAll("button").every((b) => b.hidden));
      assert.equal(root.querySelector(".record-detail").textContent, "검색 결과가 없습니다.");
      input.value = ""; input.emit("input");
      const requirement = list.querySelectorAll("button").find((b) => b.dataset.record === doc.requirements[0].id);
      requirement.click();
      root.querySelector(".record-detail").scrollTop = 190;
      click(root, "참조"); click(root, "스펙");
      assert(root.querySelector(".record-detail").textContent.includes(doc.requirements[0].title));
      assert.equal(root.querySelector(".record-detail").scrollTop, 190);
      input.value = "";
    }));

    await check(item.name + " scenario changes start with the new explanation while same-scenario tab scroll restores", () => withWorkspace((root) => {
      click(root, "확인 사항");
      let choices = root.querySelector(".nav-list").querySelectorAll("button");
      choices[0].click();
      root.querySelector(".inspector-body").scrollTop = 570;
      click(root, "속성"); click(root, "설명");
      assert.equal(root.querySelector(".inspector-body").scrollTop, 570);
      click(root, "참조");
      root.querySelector(".inspector-body").scrollTop = 0; // Hidden geometry must not overwrite the saved position.
      click(root, "모델");
      assert.equal(root.querySelector(".inspector-body").scrollTop, 570);
      choices = root.querySelector(".nav-list").querySelectorAll("button");
      if (choices.length > 1) {
        choices[1].click();
        assert.equal(root.querySelector(".inspector-body").scrollTop, 0);
        assert(root.querySelector(".inspector-body").textContent.includes(doc.samples.scenarios[1].expected_behavior));
        root.querySelector(".nav-list").querySelectorAll("button")[0].click();
        assert.equal(root.querySelector(".inspector-body").scrollTop, 0);
      }
    }));

    await check(item.name + " sample drawer keeps table scroll, closes with Escape and restores keyboard focus", () => withWorkspace((root) => {
      const toggle = click(root, "샘플 데이터 보기");
      let grid = root.querySelector(".sample-grid");
      assert.equal(grid.tabIndex, 0);
      assert.equal(grid.getAttribute("role"), "region");
      assert(grid.getAttribute("aria-label").includes("전체 샘플 데이터"));
      grid.scrollTop = 120; grid.scrollLeft = 240;
      grid.focus();
      root.querySelector(".sample-drawer").emit("keydown", { key: "Escape", target: grid });
      assert.equal(root.querySelector(".sample-drawer").hidden, true);
      assert.equal(document.activeElement, toggle);
      click(root, "샘플 데이터 보기");
      grid = root.querySelector(".sample-grid");
      assert.deepEqual([grid.scrollTop, grid.scrollLeft], [120, 240]);
      click(root, "참조");
      grid.scrollTop = 0; grid.scrollLeft = 0; // Emulate a hidden container reporting zero.
      click(root, "모델");
      grid = root.querySelector(".sample-grid");
      assert.deepEqual([grid.scrollTop, grid.scrollLeft], [120, 240]);
      const nav = root.querySelector(".nav-list"); nav.scrollTop = 90;
      click(root, "확인 사항"); click(root, "업무 영역");
      assert.equal(root.querySelector(".nav-list").scrollTop, 90);
    }));

    await check(item.name + " tab controls resolve to labeled panels and glossary explains ERD notation", () => withWorkspace((root) => {
      for (const label of ["개요", "스펙", "모델", "참조"]) {
        click(root, label);
        const top = root.querySelectorAll("button").find((b) => b.id === "report-tab-" + root.dataset.tab);
        const pane = document.getElementById(top.getAttribute("aria-controls"));
        assert.equal(pane.getAttribute("role"), "tabpanel");
        assert.equal(pane.getAttribute("aria-labelledby"), top.id);
      }
      click(root.querySelector(".record-list"), "용어 안내");
      assert(root.querySelector(".record-detail").textContent.includes("0..1 / 0..N / 1..N"));
      click(root, "모델");
      for (const selector of [".navigator", ".inspector"]) {
        const paneRoot = root.querySelector(selector);
        for (const tab of paneRoot.querySelectorAll("button").filter((b) => b.getAttribute("role") === "tab")) {
          const pane = document.getElementById(tab.getAttribute("aria-controls"));
          assert.equal(pane.getAttribute("role"), "tabpanel");
        }
      }
    }));
  }

  await check("openmarket FK captions retain account, offer, product-plus-option business identity", () => {
    const doc = JSON.parse(fs.readFileSync("examples/openmarket.model.json", "utf8"));
    const listing = renderSamples(doc, "listing", null);
    assert(listing.querySelectorAll(".sample-reference").some((p) => p.textContent.includes("CP · seller-demo")));
    assert(listing.textContent.includes("CP1"), "Raw ID must remain visible");
    const mapping = renderSamples(doc, "mapping", null);
    assert(mapping.textContent.includes("CP · demo-offer-CP"));
    const product = doc.samples.datasets[0].rows.product[0];
    const sku = doc.samples.datasets[0].rows.sku.find((row) => row.product_id === product.id);
    assert(mapping.querySelectorAll(".sample-reference").some((p) => p.textContent.includes(product.name + " · " + sku.name)));
  });

  await check("sample missing, empty, null, false and zero values remain distinct", () => {
    const doc = JSON.parse(fs.readFileSync("examples/inventory.model.json", "utf8"));
    const entity = doc.model.entities[0], field = entity.attributes.find((a) => !entity.primary_key.includes(a.name)).name;
    doc.samples.datasets[0].rows[entity.id] = [undefined, "", null, false, 0].map((value, i) => ({ id: String(i), ...(value === undefined ? {} : { [field]: value }) }));
    const table = renderSamples(doc, entity.id, null);
    const column = entity.attributes.findIndex((a) => a.name === field);
    assert.deepEqual(table.querySelectorAll("tbody tr").map((tr) => tr.children[column].textContent), ["(미제공)", "(빈 문자열)", "NULL", "아니오", "0"]);
  });

  await check("reference captions use complete typed keys and the selected dataset, never ambiguous parents", () => {
    const relationship = { foreign_key: true, from: { attributes: ["a", "b"] }, to: { entity_id: "parent", attributes: ["a", "b"] } };
    const doc = { model: { entities: [{ id: "parent" }] } };
    const dataset = { rows: { parent: [{ a: "site-1", b: 1 }, { a: "site-2", b: 1 }, { a: "site-3" }] } };
    assert.equal(referenceRow(doc, dataset, relationship, { a: "site-2", b: 1 }).row.a, "site-2");
    assert.equal(referenceRow(doc, dataset, relationship, { a: "site-2", b: "1" }), null);
    assert.equal(referenceRow(doc, dataset, relationship, { a: null, b: 1 }), null);
    dataset.rows.parent.push({ a: "site-2", b: 1 });
    assert.equal(referenceRow(doc, dataset, relationship, { a: "site-2", b: 1 }), null);
    const inventory = JSON.parse(fs.readFileSync("examples/inventory.model.json", "utf8"));
    const entity = inventory.model.entities.find((e) => e.id === "item");
    const dataset2 = inventory.samples.datasets[1];
    assert.equal(sampleLabel(inventory, dataset2, entity, dataset2.rows.item[0]), dataset2.rows.item[0].name);
  });

  await check("ERD selection highlights incident edges and preserves SVG/camera; minimap coordinates and pan gestures", async () => {
    const doc = JSON.parse(fs.readFileSync("examples/inventory.model.json", "utf8"));
    const scope = graphScope(doc, { kind: "all" }), controller = new AbortController();
    const layout = () => {
      const svg = new Element("svg"), group = new Element("g");
      svg.setAttribute("viewBox", "0 0 800 400");
      group.id = "graph-root";
      svg.append(group);
      for (const entity of scope.entities) {
        const node = new Element("g"), title = new Element("title");
        node.className = "node"; node.id = "node-" + entity.id; title.textContent = entity.id;
        node.append(title); group.append(node);
      }
      for (const r of scope.relationships) {
        const edge = new Element("g"); edge.className = "edge"; edge.id = "edge-" + r.id; group.append(edge);
      }
      return svg;
    };
    let selected;
    const graph = createGraph({ engine: Promise.resolve({}), layout, signal: controller.signal, onEntity(id) { selected = id; }, onRelationship() {} });
    try {
      await graph.show(scope, "category"); graph.zoomIn();
      const stage = graph.canvas.querySelector(".graph-stage"), svg = stage.firstChild, before = stage.style.transform;
      await graph.show(scope, "item");
      assert.equal(stage.firstChild, svg);
      assert.equal(stage.style.transform, before);
      const node = svg.querySelectorAll(".node").find((n) => n.dataset.entity === "item");
      assert.equal(node.getAttribute("aria-pressed"), "true");
      assert(node.getAttribute("aria-label").includes(doc.model.entities.find((e) => e.id === "item").name));
      assert.equal(svg.querySelectorAll(".edge").filter((e) => e.className.split(" ").includes("active")).length, 1);
      node.click(); assert.equal(selected, "item");
      assert(graph.canvas.querySelector(".graph-legend").textContent.includes("0..N"));
      assert(graph.canvas.emit("selectstart").defaultPrevented);
      assert(graph.canvas.emit("dragstart").defaultPrevented);
      click(graph.canvas, "미니맵 열기");
      assert.equal(stage.style.transform, before);
      const surface = graph.canvas.querySelector(".minimap-surface"), miniSvg = surface.querySelector("svg");
      assert.equal(surface.hidden, false);
      assert.equal(surface.querySelectorAll("[id]").length, 0, "Miniature must not duplicate SVG IDs");
      miniSvg.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform(m) { return { x: this.x * m.a + m.e, y: this.y * m.d + m.f }; } });
      miniSvg.getScreenCTM = () => ({ inverse() { return { a: 2, d: 2, e: -20, f: -40 }; } });
      const view = before.match(/translate\(([-\d.]+)px,([-\d.]+)px\) scale\(([-\d.]+)\)/).slice(1).map(Number);
      surface.emit("pointerdown", { clientX: 110, clientY: 70 });
      assert.equal(stage.style.transform, `translate(${graph.canvas.clientWidth / 2 - 200 * view[2]}px,${graph.canvas.clientHeight / 2 - 100 * view[2]}px) scale(${view[2]})`);
      const afterMove = stage.style.transform;
      click(graph.canvas, "미니맵 닫기"); click(graph.canvas, "미니맵 열기");
      assert.equal(stage.style.transform, afterMove);
      graph.canvas.emit("pointerdown", { button: 0, pointerId: 5, clientX: 10, clientY: 10 });
      graph.canvas.emit("pointermove", { pointerId: 5, clientX: 60, clientY: 30 });
      graph.canvas.emit("pointerup", { pointerId: 5 });
      assert.notEqual(stage.style.transform, afterMove);
      const panned = stage.style.transform; graph.refresh(); assert.equal(stage.style.transform, panned);
    } finally { controller.abort(); }
  });
}

export { runRegressions };
