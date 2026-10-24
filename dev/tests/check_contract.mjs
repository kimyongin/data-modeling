/* One corpus is evaluated by Python, source modules and the shipped bundle. */
import fs from "node:fs";
import assert from "node:assert/strict";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { validateDocument, observationFingerprint } from "../viewer/validation.js";
import { parse } from "../viewer/json.js";
import { createImporter, commitMount, graphScope } from "../viewer/state.js";
import { specData } from "../viewer/view-data.js";
const [corpusFile, htmlFile, output] = process.argv.slice(2);
const scripts = [...fs.readFileSync(htmlFile, "utf8").matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].filter((e) => !e[1].includes("application/json"));
const context = vm.createContext({ crypto: webcrypto, TextEncoder, TextDecoder, Blob, console, setTimeout, clearTimeout });
vm.runInContext(scripts.at(-1)[2], context);
const bundled = context.ModelViewer, checks = [];
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, status: "pass" });
  } catch (error) {
    checks.push({ name, status: "fail", error: error.message });
  }
}
for (const fixture of JSON.parse(fs.readFileSync(corpusFile, "utf8"))) {
  await check(fixture.name + " source and embedded validators agree", async () => {
    for (const validate of [validateDocument, bundled.validateDocument]) {
      let error = null, report2;
      try {
        report2 = await validate(fixture.document);
      } catch (e) {
        error = e.message.split(":", 1)[0];
      }
      assert.equal(error, fixture.code);
      if (!error) assert.deepEqual(JSON.parse(JSON.stringify(report2)), fixture.python_report);
    }
    if (!fixture.code) for (const [id, expected] of Object.entries(fixture.fingerprints)) {
      assert.equal(await observationFingerprint(fixture.document, id, "sample"), expected);
      assert.equal(await bundled.observationFingerprint(fixture.document, id, "sample"), expected);
    }
  });
}
await check("strict parser rejects duplicate keys and unsafe numbers", () => {
  for (const fn of [parse, bundled.parse]) {
    assert.throws(() => fn('{"a":1,"a":2}'));
    assert.throws(() => fn('{"a":9007199254740992}'));
    assert.throws(() => fn('{"a":NaN}'));
  }
});
await check("failed preparation preserves previous mount and data", async () => {
  let current = "old", disposed = false, notice = "";
  const importer = createImporter({ load: async () => ({ value: "new" }), prepare: async () => {
    throw new Error("render error");
  }, commit: () => {
    current = "new";
  }, notify: (m) => {
    notice = m;
  } });
  await importer({});
  assert.equal(current, "old");
  assert.equal(disposed, false);
  assert(notice.includes("현재 화면은 유지됩니다."));
});
await check("failed activation rolls back DOM before disposing old view", async () => {
  const old = { root: { name: "old" }, disposed: false, dispose() {
    this.disposed = true;
  } };
  const next = { root: { name: "new" }, disposed: false, activate() {
    throw new Error("activate failure");
  }, dispose() {
    this.disposed = true;
  } };
  const host = { root: old.root, replaceChildren(root) {
    this.root = root;
  } };
  const importer = createImporter({ load: async () => 1, prepare: async () => next, commit: (candidate) => commitMount(host, old, candidate), notify() {
  } });
  await importer({});
  assert.equal(host.root, old.root);
  assert.equal(old.disposed, false);
  assert.equal(next.disposed, true);
});
await check("slow previous import cannot replace a newer import", async () => {
  let release, committed = "";
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const importer = createImporter({ load: async (source) => {
    if (source === "old") await wait;
    return source;
  }, prepare: async (data) => ({ data, dispose() {
  } }), commit: (c) => {
    committed = c.data;
  }, notify() {
  } });
  const old = importer("old");
  await importer("new");
  release();
  await old;
  assert.equal(committed, "new");
});
await check("spec resolves rules and decisions without copying them into requirements", () => {
  const fixture = JSON.parse(fs.readFileSync(corpusFile, "utf8")).find((p) => p.name === "inventory example").document;
  const spec = specData(fixture, "R-01");
  assert(spec.rules.length);
  assert(spec.rules.every((r) => fixture.rules.includes(r)));
  assert(!Object.hasOwn(fixture.requirements[0], "design_points"));
  const scenario = fixture.samples.scenarios[0], scope = graphScope(fixture, { kind: "scenario", id: scenario.id });
  assert(scope.entities.every((e) => scope.focus.has(e.id) || scope.context.has(e.id)));
});
const report = { passed: checks.filter((c) => c.status === "pass").length, failed: checks.filter((c) => c.status === "fail").length, checks };
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ passed: report.passed, failed: report.failed }));
for (const c of checks) if (c.status === "fail") console.error(c.name + ": " + c.error);
if (report.failed) process.exitCode = 1;
