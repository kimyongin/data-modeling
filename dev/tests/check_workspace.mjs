import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { Element, installDOM } from "./dom-fixture.mjs";
import { createWorkspace } from "../viewer/workspace.js";
import { validateDocument } from "../viewer/validation.js";
import { createGraph } from "../viewer/graph.js";
import { graphScope } from "../viewer/state.js";
import { runRegressions } from "./workspace-regressions.mjs";
import { runExploratoryRegressions } from "./exploratory-regressions.mjs";
import { runReviewRegressions } from "./review-regressions.mjs";
const [manifestFile, output] = process.argv.slice(2), manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")), checks = [];
const dom = installDOM();
const button = (root, label) => root.querySelectorAll("button").find((b) => b.textContent === label);
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, status: "pass" });
  } catch (error) {
    checks.push({ name, status: "fail", error: error.stack });
  }
}
for (const item of manifest) {
  const doc = JSON.parse(fs.readFileSync(path.resolve(item.input), "utf8")), report2 = await validateDocument(doc);
  const original=JSON.stringify(doc);
  await check(item.name + " full workspace tabs, inline details and drawer", () => {
    const mount = createWorkspace(doc, report2, { engine: new Promise(() => {
    }), onImport() {
    }, onExport() {
    }, viewerVersion: "2.0.0" });
    dom.body.replaceChildren(mount.root);
    mount.activate();
    assert.equal(mount.root.dataset.tab, "model");
    assert(mount.root.textContent.includes(doc.model.entities[0].name));
    button(mount.root, "개요").click();
    assert.equal(mount.root.dataset.tab, "overview");
    assert(mount.root.textContent.includes(doc.document.goal));
    button(mount.root, "스펙").click();
    assert.equal(mount.root.dataset.tab, "spec");
    assert(mount.root.querySelector(".record-detail").textContent.includes("범위와 전제"));
    const firstRequirement = mount.root.querySelector(".record-list").querySelectorAll("button").find((b) => b.textContent.startsWith(doc.requirements[0].id + ":"));
    firstRequirement.click();
    const spec = mount.root.querySelector(".record-detail").textContent;
    for (const section of ["요약", "설계안", "남은 결정"]) assert(spec.includes(section));
    assert(spec.includes(doc.requirements[0].description));
    button(mount.root, "참조").click();
    const list = mount.root.querySelector(".record-list");
    assert(list.textContent.includes("제작 과정"));
    assert(list.textContent.includes("용어 안내"));
    button(list, "용어 안내").click();
    assert(mount.root.querySelector(".record-detail").textContent.includes("PK / FK"));
    button(mount.root, "모델").click();
    button(mount.root, "확인 사항").click();
    const choice = mount.root.querySelector(".nav-list").querySelector("button");
    choice.click();
    assert(mount.root.querySelector(".diagram-toolbar").textContent.includes(doc.samples.scenarios[0].title));
    assert(mount.root.querySelector(".inspector").textContent.includes(doc.samples.scenarios[0].expected_behavior));
    button(mount.root, "샘플 데이터 보기").click();
    assert.equal(mount.root.querySelector(".sample-drawer").hidden, false);
    assert(mount.root.querySelector(".sample-grid"));
    assert.equal(mount.root.querySelector(".drawer-resizer").getAttribute("aria-orientation"), "horizontal");
    assert.equal(mount.root.querySelectorAll(".panel-resizer").length, 2);
    assert.equal(mount.root.querySelectorAll("dialog").length, 0);
    button(mount.root, "샘플 데이터 닫기").click();
    assert.equal(mount.root.querySelector(".sample-drawer").hidden, true);
    button(mount.root, "업무 영역").click();
    const all = mount.root.querySelector(".nav-list").querySelector("button");
    all.click();
    assert(mount.root.querySelector(".diagram-toolbar").textContent.includes("전체 구조"));
    assert.equal(JSON.stringify(doc),original,"Workspace changed the authored document");
    mount.dispose();
    assert.equal(dom.observers(), 0);
  });
}
await check("entity selection preserves zoom and position; explicit fit resets view", async () => {
  const doc = JSON.parse(fs.readFileSync("examples/inventory.model.json", "utf8")), scope = graphScope(doc, { kind: "all" }), abort = new AbortController();
  assert.equal(scope.key,graphScope(doc,{kind:"all",id:"all"}).key);
  function layout() {
    const svg = new Element("svg");
    svg.setAttribute("viewBox", "0 0 800 400");
    for (const entity of scope.entities) {
      const n = new Element("g");
      n.className = "node";
      const title = new Element("title");
      title.textContent = entity.id;
      n.append(title);
      svg.append(n);
    }
    return svg;
  }
  const graph = createGraph({ engine: Promise.resolve({}), onEntity() {
  }, onRelationship() {
  }, signal: abort.signal, layout });
  await graph.show(scope, scope.entities[0].id);
  graph.zoomIn();
  const before = graph.canvas.querySelector(".graph-stage").style.transform;
  await graph.show(scope, scope.entities[1].id);
  assert.equal(graph.canvas.querySelector(".graph-stage").style.transform, before);
  graph.fit();
  assert.notEqual(graph.canvas.querySelector(".graph-stage").style.transform, before);
  abort.abort();
});
await runRegressions(check, dom, manifest);
await runExploratoryRegressions(check, dom, manifest);
await runReviewRegressions(check, dom, manifest);
const report = { scope: "Direct module execution with minimal DOM fixture; includes UI regression behaviors, not browser CSS/layout validation", passed: checks.filter((c) => c.status === "pass").length, failed: checks.filter((c) => c.status === "fail").length, checks };
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ passed: report.passed, failed: report.failed }));
for (const c of checks) if (c.status === "fail") console.error(c.name + "\n" + c.error);
if (report.failed) process.exitCode = 1;
