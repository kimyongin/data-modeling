/* Execute the entire shipped app bootstrap and file-event path, not extracted functions.
   Minimal DOM only. Graphviz is tested separately; this is not browser visual QA. */
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { Element, installDOM } from "./dom-fixture.mjs";
import { historicalRoleDocument, redundantTargetDocument } from "./change-fixtures.mjs";

async function runAppRegressions(check, html, manifest) {
  const dom = installDOM(), scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
  const host = new Element("div"); host.id = "app";
  const metadata = new Element("script"); metadata.id = "viewer-data";
  metadata.textContent = scripts.find((s) => s[1].includes("application/json"))[2];
  dom.body.append(host, metadata);
  const blobs = new Map(), downloads = [];
  class CaptureURL extends URL {
    static createObjectURL(blob) { const url = "blob:test-" + blobs.size; blobs.set(url, blob); return url; }
    static revokeObjectURL() {}
  }
  const oldClick = Element.prototype.click;
  Element.prototype.click = function () {
    if (this.tagName === "A" && this.download) downloads.push({ name: this.download, url: this.href });
    return oldClick.call(this);
  };
  const context = vm.createContext({ document: globalThis.document, Node: Element, ResizeObserver: globalThis.ResizeObserver, AbortController, URL: CaptureURL, Blob, crypto: webcrypto, TextEncoder, TextDecoder, console, setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)), clearTimeout, Viz: { instance: () => new Promise(() => {}) } });
  const click = (label, within = host) => {
    const button = within.querySelectorAll("button").find((n) => n.textContent === label);
    assert(button, "Missing button: " + label); button.click();
  };
  const input = () => host.querySelectorAll("input").find((n) => n.type === "file");
  async function until(predicate) {
    for (let i = 0; i < 300; i++) { if (predicate()) return; await new Promise((r) => setTimeout(r, 1)); }
    throw Error("App event timed out");
  }
  function choose(file) {
    const notice = host.querySelector(".transfer-notice"); if (notice) notice.hidden = true;
    const picker = input(); picker.files = file ? [file] : []; picker.emit("change");
  }
  function file(doc, name = "review.model.json") {
    const raw = typeof doc === "string" ? doc : JSON.stringify(doc);
    return { name, size: new TextEncoder().encode(raw).length, text: async () => raw };
  }
  async function load(doc, name) {
    const previous = host.firstChild; choose(file(doc, name));
    await until(() => host.firstChild !== previous && host.querySelector("h1")?.textContent === doc.document.title);
  }
  async function reject(badFile, expected) {
    const root = host.firstChild, title = host.querySelector("h1").textContent;
    const detail = host.querySelector(".record-detail"), prior = detail?.textContent, scroll = detail?.scrollTop;
    choose(badFile);
    await until(() => { const n = host.querySelector(".transfer-notice"); return n && !n.hidden && n.dataset.error === "true"; });
    const message = host.querySelector(".transfer-notice").textContent;
    assert.equal(host.firstChild, root); assert.equal(host.querySelector("h1").textContent, title);
    if (detail) { assert.equal(detail.textContent, prior); assert.equal(detail.scrollTop, scroll); }
    for (const text of expected) assert(message.includes(text), message);
    assert(message.includes("현재 화면은 유지됩니다."));
  }
  try {
    vm.runInContext(scripts.filter((s) => !s[1].includes("application/json")).at(-1)[2], context);
    await check("shipped app opens empty and gives recoverable syntax guidance before any document exists", async () => {
      assert.equal(host.querySelector("h1").textContent, "데이터 모델링 뷰어");
      await reject(file('{"broken": nope'), ["JSON 문법", "따옴표"]);
    });
    for (const item of manifest) {
      const doc = JSON.parse(fs.readFileSync(item.input, "utf8"));
      await check(item.name + " shipped app file import, multiword search, sample drawer and exact Blob export", async () => {
        await load(doc, item.name + ".model.json");
        click("스펙");
        assert.equal(host.querySelector(".change-impact"), null);
        click("참조"); click("설계 변경 기록");
        const impact = host.querySelector(".change-impact");
        assert.equal(impact.querySelectorAll(".change-card").length, Math.min(1, doc.change_impact.changes.length));
        assert.equal(impact.querySelectorAll(".impact-area").length, doc.change_impact.areas.length);
        if (doc.change_impact.changes.length) { assert(impact.textContent.includes("변경 전")); assert(impact.textContent.includes("변경 후")); }
        if (item.name === "booking-change") {
          assert.equal(impact.querySelectorAll(".impact-group").length, 1);
          assert(impact.textContent.includes("영향 미확인"));
        }
        const query = doc.requirements[0].id.toLowerCase() + "\t" + doc.requirements[0].title.split(/\s+/).at(-1);
        click("스펙");
        const search = host.querySelector(".record-list").querySelector("input"); search.value = " " + query + " "; search.emit("input");
        assert(host.querySelector(".record-items").querySelectorAll("button").some((b) => !b.hidden && b.dataset.record === doc.requirements[0].id));
        click("모델"); click("확인 사항");
        host.querySelector(".nav-list").querySelectorAll("button")[0].click();
        click("샘플 데이터 보기");
        assert(host.querySelector(".sample-grid"));
        const count = downloads.length; click("내보내기"); await until(() => downloads.length > count);
        const exported = JSON.parse(await blobs.get(downloads.at(-1).url).text());
        assert.deepEqual(exported, doc);
        assert.equal(dom.observers(), 1);
      });
      await check(item.name + " shipped app cancelled file selection preserves current review", () => {
        const before = host.firstChild; choose(null); assert.equal(host.firstChild, before);
      });
    }
    const base = JSON.parse(fs.readFileSync("examples/openmarket.model.json", "utf8"));
    // Keep another case mounted to prove error context comes from the candidate file.
    click("스펙"); host.querySelector(".record-detail").scrollTop = 180;
    await check("shipped app missing-field guidance names candidate model/attribute and preserves prior case and scroll", async () => {
      const broken = structuredClone(base), e = broken.model.entities[0], a = e.attributes[0]; delete a.description;
      await reject(file(broken), [e.name, a.label, "설명 (description)", "/model/entities/0/attributes/0/description", "채워 주세요"]);
    });
    await check("shipped app unsupported version explains supplied and supported versions without unsafe conversion advice", async () => {
      const broken = structuredClone(base); broken.version = "1.1.0";
      await reject(file(broken), ["1.1.0", "2.0.0", "숫자만 바꾸면 안 됩니다"]);
    });
    await check("shipped app file read failure, size limit and malformed JSON offer recovery while keeping valid document", async () => {
      await reject({ name: "gone.json", size: 12, text: async () => { throw Error("PRIVATE_FILE_ERROR"); } }, ["파일을 읽을 수 없습니다", "다시 선택"]);
      assert(!host.querySelector(".transfer-notice").textContent.includes("PRIVATE_FILE_ERROR"));
      await reject({ name: "large.json", size: 21 * 1024 * 1024, text: async () => { throw Error("should not read"); } }, ["20MB", "샘플"]);
      await reject(file('{"x": "bad\\q"}'), ["JSON 문법", "이스케이프", "1행"]);
    });
    await check("shipped app latest file selection wins over slower old file and releases old observers", async () => {
      let release;
      choose({ name: "slow.json", size: 100, text: () => new Promise((r) => { release = () => r(JSON.stringify(base)); }) });
      const latest = JSON.parse(fs.readFileSync("examples/booking-change.model.json", "utf8"));
      await load(latest); release(); await new Promise((r) => setTimeout(r, 10));
      assert.equal(host.querySelector("h1").textContent, latest.document.title); assert.equal(dom.observers(), 1);
    });
    await check("shipped app accepts valid changed-before objects and opens spec without losing the current document", async () => {
      const doc = historicalRoleDocument(JSON.parse(fs.readFileSync("examples/inventory.model.json", "utf8")));
      await load(doc); click("참조"); click("설계 변경 기록");
      const row = host.querySelectorAll("tbody tr").find((tr) => tr.dataset.path === '["role"]');
      assert(row); assert(row.children[1].textContent.includes('"toString": null'));
      assert(row.children[2].textContent.includes("업무 핵심"));
      const count = downloads.length; click("내보내기"); await until(() => downloads.length > count);
      assert.deepEqual(JSON.parse(await blobs.get(downloads.at(-1).url).text()), doc);
    });
    await check("shipped app keeps typed change targets and readable composite-key additions", async () => {
      const doc = redundantTargetDocument(base); await load(doc); click("참조"); click("설계 변경 기록");
      const first = host.querySelectorAll(".change-card")[0];
      assert(first.querySelector("h4").textContent.includes("metric_definition"));
      assert(!first.querySelector("h4").textContent.includes(doc.model.relationships[0].id));
      const picker = host.querySelector(".change-picker").querySelector("select");
      picker.value = "CH-08"; picker.emit("change");
      const composite = host.querySelector(".change-card");
      assert.equal(composite.dataset.change, "CH-08");
      assert(composite.textContent.includes("연결 출발점 → 연결 속성"));
      assert(composite.querySelectorAll(".comparison-added").some((li) => li.textContent.includes("account_id")));
      assert(composite.querySelectorAll(".comparison-added").some((li) => li.textContent.includes("market")));
      const search = host.querySelector(".record-list").querySelector("input");
      search.value = "CH-08 account_id"; search.emit("input");
      assert(host.querySelector(".record-items").querySelectorAll("button").some((b) => b.dataset.record === "@changes" && !b.hidden));
    });
    await check("shipped app enum and syntax guidance allows correction without exposing file values or losing the review", async () => {
      const broken = structuredClone(base); broken.model.entities[0].role = "PRIVATE_VALUE";
      await reject(file(broken), ["모델 역할 (role)", "업무 핵심 (core)", "근거·운영 지원 (supporting)", "조건부 확장 (optional)"]);
      assert(!host.querySelector(".transfer-notice").textContent.includes("PRIVATE_VALUE"));
      await reject(file('{\n "a":1,\n "a":2\n}'), ["3행 2열", "중복 항목: a"]);
      await reject(file('{\n "a":1\n "b":2\n}'), ["3행 2열", "쉼표"]);
      await load(base); assert.equal(host.querySelector("h1").textContent, base.document.title);
    });
  } finally { Element.prototype.click = oldClick; }
}
export { runAppRegressions };
