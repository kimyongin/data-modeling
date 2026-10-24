import { el, add, button, p } from "./dom.js";
import { renderLayout } from "./layout.js";
const svgNode = (tag, attrs = {}) => {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
function createGraph({ engine, onEntity, onRelationship, signal, layout = renderLayout }) {
  const canvas = el("div", null, "graph-canvas");
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "ERD. 드래그로 이동, 휠로 확대와 축소, 방향키로 이동");
  const stage = el("div", null, "graph-stage"), hint = p("상자 선택 · 드래그로 이동 · 휠로 확대/축소", "canvas-hint");
  const minimap = el("aside", null, "minimap"), miniButton = button("미니맵 열기", () => toggleMini()), surface = el("div", null, "minimap-surface");
  surface.hidden = true;
  surface.tabIndex = 0;
  surface.setAttribute("role", "button");
  surface.setAttribute("aria-label", "미니맵. 클릭한 위치로 이동, Enter로 중앙 이동");
  const miniSvg = svgNode("svg", { "aria-hidden": "true" }), miniContent = svgNode("g"), viewport = svgNode("rect", { "class": "minimap-viewport" });
  miniSvg.append(miniContent, viewport);
  surface.append(miniSvg);
  add(minimap, miniButton, surface);
  add(canvas, stage, hint, minimap);
  const zoomLabel = el("span", "100%", "zoom-label");
  let scope = null, active = null, view = null, miniOpen = false, drag = null, suppress = false, sequence = 0;
  const cache = /* @__PURE__ */ new Map(), views = /* @__PURE__ */ new Map();
  const apply = () => {
    if (!view) return;
    stage.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.zoom})`;
    zoomLabel.textContent = Math.round(view.zoom * 100) + "%";
    updateMini();
  };
  function fit() {
    if (!active || !view) return;
    const box = active.viewBox.baseVal;
    view.zoom = Math.max(0.01, Math.min(1, (canvas.clientWidth - 48) / box.width, (canvas.clientHeight - 48) / box.height));
    view.x = (canvas.clientWidth - box.width * view.zoom) / 2 - box.x * view.zoom;
    view.y = (canvas.clientHeight - box.height * view.zoom) / 2 - box.y * view.zoom;
    apply();
  }
  function zoom(value, x = canvas.clientWidth / 2, y = canvas.clientHeight / 2) {
    if (!view) return;
    const old = view.zoom, next = Math.max(0.01, Math.min(3, value));
    view.x = x - (x - view.x) * next / old;
    view.y = y - (y - view.y) * next / old;
    view.zoom = next;
    apply();
  }
  function toggleMini() {
    miniOpen = !miniOpen;
    surface.hidden = !miniOpen;
    miniButton.textContent = miniOpen ? "미니맵 닫기" : "미니맵 열기";
    miniButton.setAttribute("aria-expanded", String(miniOpen));
    syncMini();
  }
  function syncMini() {
    if (!active || !miniOpen) return;
    miniSvg.setAttribute("viewBox", active.getAttribute("viewBox"));
    const clone = active.querySelector("g")?.cloneNode(true);
    if (!clone) return;
    clone.removeAttribute("id");
    clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    clone.querySelectorAll("[tabindex]").forEach((n) => n.removeAttribute("tabindex"));
    miniContent.replaceChildren(clone);
    updateMini();
  }
  function updateMini() {
    if (!active || !miniOpen || !view) return;
    const box = active.viewBox.baseVal;
    const x = Math.max(box.x, Math.min(box.x + box.width, -view.x / view.zoom));
    const y = Math.max(box.y, Math.min(box.y + box.height, -view.y / view.zoom));
    viewport.setAttribute("x", x);
    viewport.setAttribute("y", y);
    viewport.setAttribute("width", Math.max(0, Math.min(box.x + box.width, (canvas.clientWidth - view.x) / view.zoom) - x));
    viewport.setAttribute("height", Math.max(0, Math.min(box.y + box.height, (canvas.clientHeight - view.y) / view.zoom) - y));
  }
  function moveFromMini(event) {
    event.stopPropagation();
    event.preventDefault();
    if (!active || !view) return;
    const point = miniSvg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = miniSvg.getScreenCTM();
    if (!matrix) return;
    const pos = point.matrixTransform(matrix.inverse());
    view.x = canvas.clientWidth / 2 - pos.x * view.zoom;
    view.y = canvas.clientHeight / 2 - pos.y * view.zoom;
    apply();
  }
  surface.addEventListener("pointerdown", moveFromMini, { signal });
  surface.addEventListener("keydown", (event) => {
    const delta = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[event.key];
    if (delta && view) {
      event.preventDefault();
      view.x += delta[0];
      view.y += delta[1];
      apply();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (!active || !view) return;
      const b = active.viewBox.baseVal;
      view.x = canvas.clientWidth / 2 - (b.x + b.width / 2) * view.zoom;
      view.y = canvas.clientHeight / 2 - (b.y + b.height / 2) * view.zoom;
      apply();
    }
  }, { signal });
  for (const type of ["selectstart", "dragstart"]) canvas.addEventListener(type, (event) => event.preventDefault(), { signal });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest(".minimap")) return;
    event.preventDefault();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  }, { signal });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId || !view) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    drag.moved = true;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("dragging");
    view.x += dx;
    view.y += dy;
    drag.x = event.clientX;
    drag.y = event.clientY;
    apply();
  }, { signal });
  const end = (event) => {
    if (!drag) return;
    suppress = drag.moved;
    drag = null;
    canvas.classList.remove("dragging");
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (suppress) setTimeout(() => {
      suppress = false;
    }, 80);
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(type, end, { signal });
  canvas.addEventListener("wheel", (event) => {
    if (event.target.closest(".minimap")) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoom(view?.zoom * Math.exp(-event.deltaY * 15e-4), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false, signal });
  canvas.addEventListener("keydown", (event) => {
    if (event.target !== canvas || !view) return;
    const delta = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[event.key];
    if (delta) {
      event.preventDefault();
      view.x += delta[0];
      view.y += delta[1];
      apply();
    }
  }, { signal });
  function highlight(id, evidence = []) {
    if (!active) return;
    for (const n of active.querySelectorAll(".node")) {
      n.classList.toggle("selected", n.dataset.entity === id);
      n.classList.toggle("evidence", evidence.includes(n.dataset.entity));
    }
  }
  async function show(next, selected) {
    scope = next;
    const token = ++sequence;
    if (!cache.has(next.key)) {
      stage.replaceChildren(p("ERD 배치 중…", "empty"));
      try {
        const viz = await engine;
        if (signal.aborted || token !== sequence) return;
        cache.set(next.key, layout(viz, next, Math.max(1, canvas.clientWidth - 48), Math.max(1, canvas.clientHeight - 48)));
      } catch (error) {
        if (!signal.aborted && token === sequence) stage.replaceChildren(p("ERD 배치 실패: " + error.message, "notice"));
        return;
      }
    }
    if (signal.aborted || token !== sequence) return;
    const svg = cache.get(next.key), changed = active !== svg;
    active = svg;
    if (changed) stage.replaceChildren(svg);
    svg.style.width = svg.viewBox.baseVal.width + "px";
    svg.style.height = svg.viewBox.baseVal.height + "px";
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", next.title);
    view = views.get(next.key) || { x: 0, y: 0, zoom: 1 };
    const first = !views.has(next.key);
    views.set(next.key, view);
    for (const n of svg.querySelectorAll(".node")) {
      const id = n.querySelector("title")?.textContent;
      n.dataset.entity = id;
      n.setAttribute("role", "button");
      n.setAttribute("tabindex", "0");
      n.onclick = () => {
        if (!suppress) onEntity(id);
      };
      n.onkeydown = (e) => {
        if (["Enter", " "].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          onEntity(id);
        }
      };
    }
    for (const edge of svg.querySelectorAll(".edge")) {
      const r = next.relationships.find((r2) => "edge-" + r2.id === edge.id);
      if (!r) continue;
      edge.setAttribute("role", "button");
      edge.setAttribute("tabindex", "0");
      edge.setAttribute("aria-label", r.name + " 관계 설명");
      edge.onclick = () => {
        if (!suppress) onRelationship(r);
      };
      edge.onkeydown = (e) => {
        if (["Enter", " "].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          onRelationship(r);
        }
      };
    }
    if (first) fit();
    else apply();
    highlight(selected, next.scenario?.entity_ids || []);
    if (changed) syncMini();
  }
  return { canvas, zoomLabel, show, fit, zoomIn: () => zoom((view?.zoom || 1) * 1.2), zoomOut: () => zoom((view?.zoom || 1) / 1.2), refresh: updateMini };
}
export {
  createGraph
};
