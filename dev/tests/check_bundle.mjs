/* Execute the actual embedded modules and Graphviz engine. This is not browser visual QA. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runAppRegressions } from "./app-regressions.mjs";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [htmlFile, manifestFile, output] = process.argv.slice(2);
const html = fs.readFileSync(htmlFile, "utf8");
const entries = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
const metadata = JSON.parse(entries.find((e) => e[1].includes("application/json"))[2]);
const scripts = entries.filter((e) => !e[1].includes("application/json")).map((e) => e[2]);
const context = vm.createContext({ crypto: webcrypto, TextEncoder, TextDecoder, Blob, console, setTimeout, clearTimeout, performance, atob, btoa, require: createRequire(import.meta.url), __filename: path.resolve(htmlFile) });
const checks = [];
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, status: "pass" });
  } catch (error) {
    checks.push({ name, status: "fail", error: error.message });
  }
}
await check("self-contained current viewer with no case data", () => {
  assert.equal(metadata.document_version, "2.0.0");
  assert(!Object.hasOwn(metadata, "review"));
  assert(!Object.hasOwn(metadata, "model"));
  assert(metadata.notices["GRAPHVIZ-LICENSE.txt"]);
  assert.equal(scripts.length, 2);
  assert(!/<(?:script|link)[^>]+(?:src|href)=/i.test(html));
  for (const script of scripts) new vm.Script(script);
});
for (const script of scripts) vm.runInContext(script, context);
const api = context.ModelViewer;
const engine = await context.Viz.instance();
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
for (const item of manifest) {
  const doc = JSON.parse(fs.readFileSync(path.isAbsolute(item.input) ? item.input : path.join(repo, item.input), "utf8"));
  await check(item.name + " exact JSON import/export and current observations", async () => {
    const parsed = api.parse(JSON.stringify(doc));
    const report2 = await api.validateDocument(parsed);
    assert.equal(report2.valid, true);
    assert.deepEqual(JSON.parse(JSON.stringify(parsed)), doc);
  });
  for (const selection of [{ kind: "all" }, ...doc.model.domains.map((d) => ({ kind: "domain", id: d.id })), ...doc.samples.scenarios.map((s) => ({ kind: "scenario", id: s.id }))]) {
    await check(item.name + " ERD " + selection.kind + ":" + (selection.id || "all"), () => {
      const scope = api.graphScope(doc, selection);
      assert(scope.entities.length > 0);
      for (const dot of api.candidateDots(scope)) {
        const svg = engine.renderString(dot, { format: "svg" });
        for (const entity of scope.entities) assert(svg.includes(`id="node&#45;${entity.id.replaceAll("-", "&#45;")}"`) || svg.includes(`id="node-${entity.id}"`), "Missing " + entity.id);
        assert.equal((svg.match(/class="node"/g) || []).length, scope.entities.length);
        assert(!dot.includes('label="REL-'), "Relationship codes are not visible labels");
        assert(dot.includes("rankdir=LR"));
      }
    });
  }
}
await runAppRegressions(check, html, manifest);
const report = { scope: "Embedded validator, all ERD scopes and whole-app file events/Blob export in Node with minimal DOM; not browser visual QA", passed: checks.filter((c) => c.status === "pass").length, failed: checks.filter((c) => c.status === "fail").length, checks };
if (output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify({ passed: report.passed, failed: report.failed }));
for (const check2 of checks) if (check2.status === "fail") console.error(check2.name + ": " + check2.error);
if (report.failed) process.exitCode = 1;
