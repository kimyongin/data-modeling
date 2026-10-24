import { el, add, p, button, tabs, indexDocument } from "./dom.js";
import { createState, graphScope } from "./state.js";
import { createGraph } from "./graph.js";
import { resizer } from "./resize.js";
import { renderOverview, renderSpec, renderReference, renderInspector, renderSamples } from "./content.js";
import { checkMatches } from "./view-data.js";
import { matchesQuery } from "./search.js";
const tabDefs = [["overview", "개요"], ["spec", "스펙"], ["model", "모델"], ["sources", "참조"]];
const guides = { overview: "해결할 문제와 정보가 연결되는 큰 그림을 살펴봅니다.", spec: "요구사항별 규칙·설계 선택과 남은 결정을 읽습니다.", model: "ERD·속성·설명·샘플을 연결해 업무 동작을 검토합니다.", sources: "설계 근거와 한계, 제작 과정, 용어를 확인합니다." };
function createWorkspace(doc, report, { engine, onImport, onExport, viewerVersion, filename }) {
  const lifecycle = new AbortController(), signal = lifecycle.signal, state = createState(doc), index = indexDocument(doc);
  const root = el("main", null, "app"), header = el("header", null, "app-header"), brand = el("div", null, "brand"), h1 = el("h1", doc.document.title), guide = p("", "tab-guide"), topTabs = el("div"), actions = el("div", null, "head-actions");
  h1.title = doc.document.title;
  add(brand, h1, guide);
  add(header, brand, topTabs, actions);
  const input = el("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.hidden = true;
  input.setAttribute("aria-label", "모델 JSON 선택");
  input.addEventListener("change", () => {
    const file = input.files[0];
    input.value = "";
    if (file) onImport(file);
  }, { signal });
  add(actions, button("가져오기", () => input.click()), button("내보내기", () => onExport(doc)), input);
  const notice = el("div", null, "transfer-notice");
  notice.hidden = true;
  notice.setAttribute("role", "status");
  header.append(notice);
  function notify(message, error = false) {
    notice.replaceChildren(p(message), button("닫기", () => {
      notice.hidden = true;
    }));
    notice.dataset.error = String(error);
    notice.hidden = false;
  }
  const workspace = el("div", null, "workspace"), navigator = el("aside", null, "navigator"), navTabs = el("div"), navList = el("div", null, "nav-list"), leftHandle = el("div", null, "panel-resizer"), diagram = el("section", null, "diagram-panel"), rightHandle = el("div", null, "panel-resizer"), inspector = el("aside", null, "inspector"), collection = el("section", null, "collection");
  function listKeys(host) {
    host.addEventListener("keydown", (event) => {
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) || event.target.tagName === "INPUT") return;
      const buttons = [...host.querySelectorAll("button")].filter((b) => !b.hidden), i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      event.preventDefault();
      const n = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, i + (event.key === "ArrowDown" ? 1 : -1)));
      buttons[n]?.focus();
    }, { signal });
  }
  listKeys(navList);
  workspace.id = "report-panel";
  workspace.setAttribute("role", "tabpanel");
  navigator.id = "model-navigator";
  inspector.id = "model-inspector";
  navList.id = "model-navigation-panel";
  navList.setAttribute("role", "tabpanel");
  navigator.setAttribute("aria-label", "업무 영역과 확인 사항");
  const navFilters = el("div", null, "check-filters"), checkSearch = el("input"), checkStatus = el("select"), checkCount = p("", "caption"), navEmpty = p("검색 결과가 없습니다.", "empty");
  let checkQuery = "", checkStatusValue = "all";
  checkSearch.type = "search";
  checkSearch.placeholder = "제목·상황 검색";
  checkSearch.setAttribute("aria-label", "확인 사항 검색");
  checkStatus.setAttribute("aria-label", "확인 사항 기록 상태");
  for (const [value, title] of [["all", "전체 상태"], ["recorded", "확인 기록 있음"], ["unconfirmed", "미확인"]]) {
    const option = el("option", title);
    option.value = value;
    checkStatus.append(option);
  }
  checkStatus.value = "all";
  checkCount.setAttribute("role", "status");
  checkSearch.addEventListener("input", () => { checkQuery = checkSearch.value; filterChecks(); }, { signal });
  checkStatus.addEventListener("change", () => { checkStatusValue = checkStatus.value; filterChecks(); }, { signal });
  navFilters.hidden = true;
  add(navFilters, checkSearch, checkStatus, checkCount);
  add(navigator, navTabs, navFilters, navList);
  const toolbar = el("div", null, "diagram-toolbar"), graphTitle = el("h2"), tools = el("div", null, "tools");
  let active = false, relationshipId = null, lastRecord = null, drawerOpen = false, leftWidth = 220, rightWidth = 400, drawerHeight = 340;
  let preferredLeft = 220, preferredRight = 400, preferredDrawer = null, resetExplanation = false, inspectorVisible = false, samplesVisible = false;
  const graph = createGraph({ engine, signal, onEntity: (id) => {
    relationshipId = null;
    state.update({ entityId: id, detail: "attributes" });
  }, onRelationship: (r) => {
    relationshipId = r.id;
    state.update({ entityId: r.from.entity_id, detail: "explanation" });
  } });
  const drawer = el("section", null, "sample-drawer"), drawerHandle = el("div", null, "drawer-resizer"), drawerHead = el("div", null, "drawer-head"), drawerTitle = el("h3", "샘플 데이터"), sampleBody = el("div", null, "sample-body");
  drawer.hidden = true;
  drawer.id = "sample-drawer";
  const sampleToggle = button("샘플 데이터 보기", () => setDrawer(!drawerOpen));
  sampleToggle.setAttribute("aria-controls", drawer.id);
  sampleToggle.setAttribute("aria-expanded", "false");
  const datasetControl = el("label", null, "dataset-control"), datasetLabel = el("span", "예시 데이터"), datasetSelect = el("select");
  datasetSelect.setAttribute("aria-label", "샘플 데이터셋");
  for (const dataset of doc.samples.datasets) {
    const option = el("option", dataset.title);
    option.value = dataset.id;
    datasetSelect.append(option);
  }
  datasetControl.hidden = doc.samples.datasets.length < 2;
  datasetSelect.addEventListener("change", () => {
    if (state.get().scope.kind === "scenario" || !doc.samples.datasets.some((d) => d.id === datasetSelect.value)) {
      datasetSelect.value = state.get().datasetId;
      return;
    }
    state.update({ datasetId: datasetSelect.value });
  }, { signal });
  add(datasetControl, datasetLabel, datasetSelect);
  add(drawerHead, drawerTitle, datasetControl, button("닫기", () => setDrawer(false)));
  add(drawer, drawerHandle, drawerHead, sampleBody);
  const zoomOut = button("−", graph.zoomOut), zoomIn = button("+", graph.zoomIn);
  for (const [control, label] of [[zoomOut, "ERD 축소"], [zoomIn, "ERD 확대"]]) {
    control.setAttribute("aria-label", label);
    control.title = label;
  }
  add(tools, sampleToggle, zoomOut, graph.zoomLabel, zoomIn, button("화면 맞춤", graph.fit), button("전체 모델", () => chooseScope({ kind: "all" })));
  add(toolbar, graphTitle, tools);
  add(diagram, toolbar, graph.canvas, drawer);
  add(workspace, navigator, leftHandle, diagram, rightHandle, inspector, collection);
  const footer = el("footer", null, "app-footer");
  add(footer, p(filename || "모델 JSON 2.0"), p("뷰어 " + viewerVersion + " · 실제 구현 확인과 샘플 검사를 구별해 읽어 주세요."));
  add(root, header, workspace, footer);
  const scopeBounds = (which) => {
    const budget = Math.max(800, workspace.clientWidth) - 340 - 20;
    return { min: which === "left" ? 180 : 300, max: Math.max(which === "left" ? 180 : 300, budget - (which === "left" ? rightWidth : leftWidth)) };
  };
  function syncSizes() {
    if (!active || state.get().tab !== "model") return;
    const budget = Math.max(800, workspace.clientWidth) - 340 - 20;
    leftWidth = Math.max(180, Math.min(preferredLeft, budget - 300));
    rightWidth = Math.max(300, Math.min(preferredRight, budget - leftWidth));
    workspace.style.setProperty("--left-width", leftWidth + "px");
    workspace.style.setProperty("--right-width", rightWidth + "px");
    const bounds = drawerBounds();
    drawerHeight = Math.max(bounds.min, Math.min(bounds.max, preferredDrawer ?? Math.min(340, graph.canvas.clientHeight * 0.48)));
    drawer.style.height = drawerHeight + "px";
    graph.setObscuredBottom(drawerOpen ? drawerHeight : 0);
    leftResize.sync();
    rightResize.sync();
    sampleResize.sync();
    graph.refresh();
  }
  function drawerBounds() {
    return { min: Math.min(150, Math.max(80, graph.canvas.clientHeight - 80)), max: Math.max(80, graph.canvas.clientHeight - 80) };
  }
  const leftResize = resizer(leftHandle, { axis: "x", signal, controls: navigator.id, label: "왼쪽 패널 너비 조절", bounds: () => scopeBounds("left"), get: () => leftWidth, set: (v) => {
    preferredLeft = v;
    syncSizes();
  }, reset: () => {
    preferredLeft = 220;
    syncSizes();
  } });
  const rightResize = resizer(rightHandle, { axis: "x", direction: -1, signal, controls: inspector.id, label: "오른쪽 패널 너비 조절", bounds: () => scopeBounds("right"), get: () => rightWidth, set: (v) => {
    preferredRight = v;
    syncSizes();
  }, reset: () => {
    preferredRight = 400;
    syncSizes();
  } });
  const sampleResize = resizer(drawerHandle, { axis: "y", direction: -1, signal, controls: drawer.id, label: "샘플 데이터 높이 조절", bounds: drawerBounds, get: () => drawerHeight, set: (v) => {
    preferredDrawer = v;
    syncSizes();
  }, reset: () => {
    preferredDrawer = null;
    syncSizes();
  } });
  function setDrawer(open) {
    if (!open) saveSamples();
    drawerOpen = open;
    if (!open) samplesVisible = false;
    drawer.hidden = !open;
    sampleToggle.textContent = open ? "샘플 데이터 닫기" : "샘플 데이터 보기";
    sampleToggle.setAttribute("aria-expanded", String(open));
    if (open) {
      drawSamples(false);
    }
    syncSizes();
    if (!open && drawer.contains(document.activeElement)) sampleToggle.focus();
  }
  drawer.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setDrawer(false);
    }
  }, { signal });
  const sampleScroll = /* @__PURE__ */ new Map(), detailScroll = /* @__PURE__ */ new Map(), recordScroll = /* @__PURE__ */ new Map(), queries = { spec: "", sources: "" }, recordListScroll = { spec: 0, sources: 0 }, navScroll = { domains: 0, checks: 0 };
  function saveSamples() {
    const grid = sampleBody.querySelector(".sample-grid");
    if (grid && samplesVisible && drawerOpen && state.get().tab === "model") sampleScroll.set(sampleBody.dataset.key, [grid.scrollLeft, grid.scrollTop]);
  }
  function drawSamples(save = true) {
    const s = state.get(), key = s.entityId + "/" + s.datasetId;
    if (save) saveSamples();
    sampleBody.dataset.key = key;
    sampleBody.replaceChildren(renderSamples(doc, s.entityId, s.scope.kind === "scenario" ? s.scope.id : null, s.datasetId));
    datasetSelect.value = s.datasetId;
    datasetSelect.disabled = s.scope.kind === "scenario";
    datasetLabel.textContent = datasetSelect.disabled ? "확인 사항의 예시" : "예시 데이터";
    samplesVisible = drawerOpen && s.tab === "model";
    const grid = sampleBody.querySelector(".sample-grid"), position = sampleScroll.get(key);
    if (grid && position) {
      grid.scrollLeft = position[0];
      grid.scrollTop = position[1];
    }
    drawerTitle.textContent = "샘플 데이터 · " + (index.get(s.entityId)?.name || "");
  }
  function chooseScope(selection) {
    relationshipId = null;
    const scope = graphScope(doc, selection), s = state.get();
    resetExplanation = selection.kind === "scenario" && (s.scope.kind !== "scenario" || s.scope.id !== selection.id);
    state.update({ scope: selection, datasetId: scope.scenario?.dataset_id || s.datasetId, entityId: scope.focus.has(s.entityId) ? s.entityId : scope.entities.find((e) => scope.focus.has(e.id))?.id || scope.entities[0]?.id, detail: selection.kind === "scenario" ? "explanation" : s.detail });
  }
  function filterChecks() {
    if (state.get().nav !== "checks") return;
    let visible = 0, selectedHidden = false;
    for (const b of navList.querySelectorAll("button")) {
      const scenario = doc.samples.scenarios.find((s) => s.id === b.dataset.item);
      const observation = doc.observations.find((o) => o.scenario_id === scenario.id);
      b.hidden = !checkMatches(scenario, observation, checkQuery, checkStatusValue);
      if (!b.hidden) visible++;
      if (b.hidden && state.get().scope.id === scenario.id) selectedHidden = true;
    }
    navEmpty.hidden = visible > 0;
    checkCount.textContent = visible + " / " + doc.samples.scenarios.length + "개" + (selectedHidden ? " · 선택한 항목은 검색 밖에 있습니다." : "");
  }
  function drawNav() {
    const s = state.get();
    navigator.dataset.mode = s.nav;
    navFilters.hidden = s.nav !== "checks";
    const scroll = navList.scrollTop, focused = navList.contains(document.activeElement) ? document.activeElement?.dataset.item : null;
    navTabs.replaceChildren(tabs([["domains", "업무 영역"], ["checks", "확인 사항"]], s.nav, (id) => {
      navScroll[s.nav] = navList.scrollTop;
      state.update({ nav: id });
      navList.scrollTop = navScroll[id];
    }, "모델 탐색 방식", { prefix: "model-navigation", panelId: navList.id }));
    navList.setAttribute("aria-labelledby", "model-navigation-" + s.nav);
    navList.replaceChildren();
    const items = s.nav === "domains" ? [{ id: "all", name: "전체 보기", description: "통합·전용 모델을 모두 봅니다." }, ...doc.model.domains] : doc.samples.scenarios;
    for (const item of items) {
      const b = button("", () => chooseScope({ kind: s.nav === "checks" ? "scenario" : item.id === "all" ? "all" : "domain", id: item.id }), "navigation-item");
      b.dataset.item = item.id;
      add(b, el("strong", s.nav === "checks" ? index.label(item.id) : item.name));
      if (item.description) b.append(p(item.description, "caption"));
      if (s.nav === "checks") {
        const o = doc.observations.find((o2) => o2.scenario_id === item.id);
        b.append(p(o ? o.status === "pass" ? "확인 기록 있음" : "예상과 다른 결과" : "미확인", "caption"));
      }
      b.setAttribute("aria-pressed", String(s.scope.kind === "all" ? item.id === "all" : s.scope.id === item.id));
      navList.append(b);
    }
    if (s.nav === "checks") {
      navList.append(navEmpty);
      filterChecks();
    }
    navList.scrollTop = scroll;
    if (focused) navList.querySelector(`[data-item="${focused}"]`)?.focus({ preventScroll: true });
  }
  function saveInspector() {
    const previous = inspector.querySelector(".inspector-body");
    if (inspectorVisible && previous) detailScroll.set(inspector.dataset.key, previous.scrollTop);
  }
  function drawInspector(scope) {
    const s = state.get();
    saveInspector();
    inspector.dataset.key = s.entityId + "/" + s.detail + (s.detail === "explanation" && scope.scenario ? "/" + scope.scenario.id : "");
    const heading = add(el("div", null, "inspector-heading"), p("선택한 모델", "caption"), el("h2", index.get(s.entityId)?.name || ""), p(s.entityId, "code"));
    const subtabs = tabs([["attributes", "속성"], ["explanation", "설명"]], s.detail, (id) => state.update({ detail: id }), "모델 상세 범주", { prefix: "model-detail", panelId: "model-detail-panel" });
    const body = renderInspector(doc, s.entityId, s.detail, scope, index, relationshipId);
    body.id = "model-detail-panel";
    body.setAttribute("role", "tabpanel");
    body.setAttribute("aria-labelledby", "model-detail-" + s.detail);
    body.tabIndex = 0;
    inspector.replaceChildren(heading, subtabs, body);
    inspectorVisible = true;
    body.scrollTop = resetExplanation ? 0 : detailScroll.get(inspector.dataset.key) || 0;
    resetExplanation = false;
    if (relationshipId) {
      const card = body.querySelector(`[data-relationship="${relationshipId}"]`);
      if (card) body.scrollTop = card.offsetTop - body.offsetTop;
      relationshipId = null;
    }
  }
  const tabRecords = { spec: null, sources: null };
  function saveCollection() {
    const detail = collection.querySelector(".record-detail");
    if (lastRecord && detail) recordScroll.set(lastRecord, detail.scrollTop);
  }
  function drawCollection() {
    const s = state.get();
    collection.className = "collection " + s.tab;
    if (s.tab === "overview") {
      collection.replaceChildren(renderOverview(doc, engine, signal));
      return;
    }
    const items = s.tab === "spec" ? [{ id: "@scope", title: "범위와 전제" }, { id: "@common", title: "공통 설계 판단" }, ...doc.requirements] : [...doc.sources, { id: "@changes", title: "설계 변경 기록" }, { id: "@process", title: "제작 과정" }, { id: "@glossary", title: "용어 안내" }];
    const key = s.tab + ":" + (tabRecords[s.tab] || s.recordId || items[0].id);
    if (lastRecord === key) return;
    lastRecord = key;
    const list = el("aside", null, "record-list"), search = el("input"), itemsHost = el("div", null, "record-items"), detail = el("div", null, "record-detail");
    detail.tabIndex = 0;
    search.type = "search";
    search.placeholder = "제목과 내용 검색";
    search.value = queries[s.tab];
    search.setAttribute("aria-label", "목록 제목과 내용 검색");
    add(list, search, itemsHost);
    listKeys(itemsHost);
    let selected = null;
    // Search the same readable content shown in the detail pane, including linked judgments.
    const bodies = new Map(items.map((item) => [item.id, s.tab === "spec" ? renderSpec(doc, item.id, index) : renderReference(doc, item.id, index, { selectedId: s.changeId, onSelect: (id) => state.update({ changeId: id }) })]));
    const selectRecord = (item) => {
      if (selected?.id === item?.id) return;
      if (selected && lastRecord) recordScroll.set(lastRecord, detail.scrollTop);
      selected = item;
      lastRecord = item ? s.tab + ":" + item.id : null;
      for (const b of itemsHost.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.record === item?.id));
      if (item) {
        tabRecords[s.tab] = item.id;
        detail.replaceChildren(bodies.get(item.id));
        detail.scrollTop = recordScroll.get(lastRecord) || 0;
      } else {
        detail.replaceChildren(p("검색 결과가 없습니다.", "empty"));
        detail.scrollTop = 0;
      }
    };
    for (const item of items) {
      const b = button(["@scope", "@common", "@process", "@glossary", "@changes"].includes(item.id) ? item.title : index.label(item.id), () => {
        recordListScroll[s.tab] = itemsHost.scrollTop;
        selectRecord(item);
      }, "navigation-item");
      b.dataset.record = item.id;
      b.dataset.search = b.textContent + " " + bodies.get(item.id).textContent + " " + (bodies.get(item.id).dataset.searchText || "");
      b.setAttribute("aria-pressed", "false");
      itemsHost.append(b);
    }
    const filter = () => {
      queries[s.tab] = search.value;
      const query = search.value;
      const buttons = [...itemsHost.querySelectorAll("button")];
      for (const b of buttons) b.hidden = !matchesQuery(b.dataset.search, query);
      const visible = buttons.filter((b) => !b.hidden).map((b) => items.find((item) => item.id === b.dataset.record));
      const chosen = visible.find((item) => item.id === (selected?.id || tabRecords[s.tab] || s.recordId)) || visible[0] || null;
      if (!chosen && !selected) {
        lastRecord = null;
        detail.replaceChildren(p("검색 결과가 없습니다.", "empty"));
      } else selectRecord(chosen);
    };
    search.addEventListener("input", filter, { signal });
    filter();
    itemsHost.addEventListener("scroll", () => {
      recordListScroll[s.tab] = itemsHost.scrollTop;
    }, { signal });
    collection.replaceChildren(list, detail);
    // Detached elements cannot restore a nonzero scroll position in the browser.
    if (selected) detail.scrollTop = recordScroll.get(lastRecord) || 0;
    itemsHost.scrollTop = recordListScroll[s.tab];
  }
  function render() {
    if (!active) return;
    const s = state.get();
    root.dataset.tab = s.tab;
    workspace.setAttribute("aria-labelledby", "report-tab-" + s.tab);
    guide.textContent = tabDefs.find((t) => t[0] === s.tab)[1] + " - " + guides[s.tab];
    topTabs.replaceChildren(tabs(tabDefs, s.tab, (id) => {
      if (id !== s.tab) {
        saveCollection();
        if (s.tab === "model") {
          saveSamples();
          samplesVisible = false;
          saveInspector();
          inspectorVisible = false;
        }
        lastRecord = null;
        state.update({ tab: id, recordId: tabRecords[id] || null });
      }
    }, "보고서 범주", { prefix: "report-tab", panelId: workspace.id }));
    if (s.tab === "model") {
      const scope = graphScope(doc, s.scope);
      drawNav();
      graphTitle.textContent = scope.title + " · " + scope.focus.size + "개 검토" + (scope.context.size ? " + " + scope.context.size + "개 연결" : "");
      drawInspector(scope);
      drawSamples();
      syncSizes();
      graph.show(scope, s.entityId);
    } else drawCollection();
    if (report.warnings.length) footer.firstChild.textContent = (filename || "모델 JSON") + " · 검토 경고 " + report.warnings.length + "건";
  }
  if (report.warnings.length) {
    const block = sectionWarnings(report.warnings);
    footer.append(button("검토 경고", () => {
      notice.replaceChildren(block, button("닫기", () => {
        notice.hidden = true;
      }));
      notice.hidden = false;
    }));
  }
  function sectionWarnings(warnings) {
    const block = el("div");
    block.append(p("형식 통과와 업무 검토 완료는 다릅니다."));
    for (const w of warnings) block.append(p(w.path + " · " + w.message));
    return block;
  }
  const unsubscribe = state.subscribe(render);
  let observer = null;
  return { root, document: doc, notify, activate() {
    active = true;
    render();
    observer = new ResizeObserver(() => {
      syncSizes();
      graph.refresh();
    });
    observer.observe(workspace);
    observer.observe(graph.canvas);
  }, dispose() {
    active = false;
    lifecycle.abort();
    unsubscribe();
    observer?.disconnect();
  } };
}
export {
  createWorkspace
};
