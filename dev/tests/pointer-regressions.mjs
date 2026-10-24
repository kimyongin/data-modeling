import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { Element } from "./dom-fixture.mjs";
import { createGraph } from "../viewer/graph.js";
import { graphScope } from "../viewer/state.js";

export async function runPointerRegressions(check, dom, manifest) {
  for (const item of manifest) {
    const doc = JSON.parse(fs.readFileSync(path.resolve(item.input), "utf8"));
    async function withGraph(run) {
      const abort = new AbortController(), scope = graphScope(doc, { kind: "all" });
      const graph = createGraph({ engine: Promise.resolve({}), signal: abort.signal,
        onEntity() {}, onRelationship() {}, layout() {
          const svg = new Element("svg"), group = new Element("g"), node = new Element("g"), title = new Element("title");
          node.className = "node"; title.textContent = scope.entities[0].id;
          node.append(title); group.append(node); svg.append(group);
          svg.setAttribute("viewBox", "0 0 800 400");
          return svg;
        } });
      dom.body.replaceChildren(graph.canvas);
      try {
        await graph.show(scope, scope.entities[0].id);
        graph.canvas.querySelectorAll("button").find(b => b.textContent === "미니맵 열기").click();
        const surface = graph.canvas.querySelector(".minimap-surface"), svg = surface.querySelector("svg"), stage = graph.canvas.querySelector(".graph-stage");
        svg.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } });
        svg.getScreenCTM = () => ({ inverse: () => ({}) });
        const camera = () => stage.style.transform.match(/translate\(([-\d.]+)px,([-\d.]+)px\) scale\(([-\d.]+)\)/).slice(1).map(Number);
        await run({ graph, surface, stage, camera, abort, scope });
      } finally { abort.abort(); }
    }

    await check(item.name + " open minimap tracks selection and scenario emphasis without moving the camera", () => withGraph(async ({ graph, surface, stage, scope }) => {
      const before = stage.style.transform;
      const main = stage.querySelector(".node");
      assert(surface.querySelector(".node").className.split(" ").includes("selected"));
      await graph.show({ ...scope, scenario: { entity_ids: [scope.entities[0].id] } }, scope.entities[1].id);
      const mini = surface.querySelector(".node");
      assert.equal(mini.className, main.className);
      assert(!mini.className.split(" ").includes("selected"));
      assert(mini.className.split(" ").includes("evidence"));
      assert.equal(stage.style.transform, before);
    }));

    await check(item.name + " minimap ignores secondary clicks without stealing focus or camera", () => withGraph(({ graph, surface, stage }) => {
      graph.canvas.focus();
      const before = stage.style.transform;
      for (const button of [1, 2]) {
        surface.emit("pointerdown", { button, pointerId: 7, clientX: 30, clientY: 20 });
        assert.equal(stage.style.transform, before);
        assert(document.activeElement === graph.canvas);
        assert(!surface.hasPointerCapture(7));
      }
    }));

    await check(item.name + " minimap drag follows its pointer, clamps outside graph and releases on cancel/close/dispose", () => withGraph(({ graph, surface, camera, abort }) => {
      const z = camera()[2];
      surface.emit("pointerdown", { button: 0, pointerId: 11, clientX: 100, clientY: 80 });
      assert(document.activeElement === surface);
      assert(surface.hasPointerCapture(11));
      surface.emit("pointermove", { pointerId: 12, clientX: 600, clientY: 300 });
      assert.deepEqual(camera(), [500 - 100 * z, 300 - 80 * z, z]);
      surface.emit("pointermove", { pointerId: 11, clientX: 400, clientY: 200 });
      assert.deepEqual(camera(), [500 - 400 * z, 300 - 200 * z, z]);
      surface.emit("pointermove", { pointerId: 11, clientX: -100, clientY: 900 });
      assert.deepEqual(camera(), [500, 300 - 400 * z, z]);
      surface.emit("pointerup", { pointerId: 11 });
      assert(!surface.hasPointerCapture(11));
      const released = camera();
      surface.emit("pointermove", { pointerId: 11, clientX: 200, clientY: 100 });
      assert.deepEqual(camera(), released);
      for (const ending of ["pointercancel", "lostpointercapture"]) {
        surface.emit("pointerdown", { button: 0, pointerId: 13, clientX: 100, clientY: 100 });
        surface.emit(ending, { pointerId: 13 });
        assert(!surface.hasPointerCapture(13));
      }
      surface.emit("pointerdown", { button: 0, pointerId: 14, clientX: 200, clientY: 100 });
      graph.canvas.querySelectorAll("button").find(b => b.textContent === "미니맵 닫기").click();
      assert(!surface.hasPointerCapture(14));
      assert(document.activeElement !== surface, "Closing must not strand keyboard focus in the hidden map");
      graph.canvas.querySelectorAll("button").find(b => b.textContent === "미니맵 열기").click();
      surface.emit("pointerdown", { button: 0, pointerId: 15, clientX: 200, clientY: 100 });
      abort.abort();
      assert(!surface.hasPointerCapture(15));
    }));

    await check(item.name + " clicking/panning graph transfers keyboard focus from resize controls to graph", () => withGraph(({ graph, camera }) => {
      const previous = new Element("div"); previous.focus();
      const before = camera();
      graph.canvas.emit("pointerdown", { button: 0, pointerId: 3, clientX: 100, clientY: 100 });
      assert(document.activeElement === graph.canvas);
      graph.canvas.emit("pointerup", { pointerId: 3 });
      graph.canvas.emit("keydown", { key: "ArrowRight" });
      assert.equal(camera()[0], before[0] - 40);
      const node = graph.canvas.querySelector(".graph-stage").querySelector(".node");
      graph.canvas.emit("pointerdown", { target: node, button: 0, pointerId: 4, clientX: 100, clientY: 100 });
      assert(document.activeElement === node);
      graph.canvas.emit("pointermove", { pointerId: 4, clientX: 130, clientY: 120 });
      assert(document.activeElement === graph.canvas, "A node drag pans; subsequent arrow keys must pan too");
      graph.canvas.emit("pointercancel", { pointerId: 4 });
    }));

    await check(item.name + " minimap keyboard activation supports Space without scrolling and preserves zoom", () => withGraph(({ surface, camera }) => {
      surface.emit("pointerdown", { button: 0, pointerId: 2, clientX: 100, clientY: 50 });
      surface.emit("pointerup", { pointerId: 2 });
      const z = camera()[2], event = surface.emit("keydown", { key: " " });
      assert(event.defaultPrevented);
      assert.deepEqual(camera(), [500 - 400 * z, 300 - 200 * z, z]);
    }));
  }
}
