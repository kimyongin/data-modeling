/* Ephemeral UI state; never serialized into the model document. */
function createState(document) {
  let state = { tab: "model", nav: "domains", scope: { kind: "all" }, datasetId: document.samples.datasets[0].id, entityId: document.model.entities[0].id, detail: "attributes", recordId: null };
  const subscribers = /* @__PURE__ */ new Set();
  return {
    get: () => state,
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    update(patch) {
      state = { ...state, ...patch };
      for (const fn of subscribers) fn(state);
    }
  };
}
function graphScope(document, selection) {
  const scenario = selection.kind === "scenario" ? document.samples.scenarios.find((s) => s.id === selection.id) : null;
  const domain = selection.kind === "domain" ? document.model.domains.find((d) => d.id === selection.id) : null;
  const focus = new Set(scenario?.entity_ids || domain?.entity_ids || document.model.entities.map((e) => e.id));
  const context = /* @__PURE__ */ new Set();
  if (selection.kind !== "all") {
    for (const r of document.model.relationships) if (focus.has(r.from.entity_id) && !focus.has(r.to.entity_id)) context.add(r.to.entity_id);
  }
  const visible = /* @__PURE__ */ new Set([...focus, ...context]);
  return {
    key: selection.kind === "all" ? "all" : selection.kind + ":" + (selection.id || ""),
    title: scenario ? scenario.id + ": " + scenario.title : domain?.name || "전체 구조",
    scenario,
    domain,
    focus,
    context,
    entities: document.model.entities.filter((e) => visible.has(e.id)),
    allRelationships: document.model.relationships,
    relationships: document.model.relationships.filter((r) => visible.has(r.from.entity_id) && visible.has(r.to.entity_id))
  };
}
function createImporter({ load, prepare, commit, notify }) {
  let sequence = 0;
  return async (source) => {
    const token = ++sequence;
    let candidate = null;
    try {
      const data = await load(source);
      if (token !== sequence) return;
      candidate = await prepare(data);
      if (token !== sequence) {
        candidate.dispose();
        return;
      }
      commit(candidate);
      candidate = null;
      notify("가져왔습니다. 확인 결과는 파일에 기록된 내용이며 여기서 새로 실행한 결과가 아닙니다.");
    } catch (error) {
      candidate?.dispose();
      if (token === sequence) notify("가져오지 못했습니다. " + error.message + " 현재 화면은 유지됩니다.", true);
    }
  };
}
function commitMount(host, current, candidate) {
  try {
    host.replaceChildren(candidate.root);
    candidate.activate();
  } catch (error) {
    host.replaceChildren(current.root);
    throw error;
  }
  current.dispose();
  return candidate;
}
export {
  commitMount,
  createImporter,
  createState,
  graphScope
};
