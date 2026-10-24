import { validateModel } from "./vendor/schema.js";
import { typed, key, fingerprint } from "./fingerprint.js";
import { MAX_BYTES } from "./json.js";
const fail = (code, path = "") => {
  throw new Error(code + ": " + path);
};
const topics = ["identity", "ownership", "lifecycle", "time", "aggregation", "concurrency", "integration", "access", "retention"];
const areas = ["writes", "reads", "contracts", "existing_data", "history", "rollout", "rollback"];
const subset = (keys, object) => Object.fromEntries(Object.entries(object).filter(([k]) => keys.includes(k)));
const same = (a, b) => key(a) === key(b);
function observationInput(document, scenarioId, method) {
  const scenario = document.samples.scenarios.find((s) => s.id === scenarioId);
  if (method === "manual") return Object.fromEntries(Object.entries(document).filter(([k]) => k !== "observations"));
  const visible = new Set(scenario.entity_ids);
  let size;
  do {
    size = visible.size;
    for (const r of document.model.relationships) if (visible.has(r.from.entity_id)) visible.add(r.to.entity_id);
  } while (visible.size !== size);
  const dataset = document.samples.datasets.find((d) => d.id === scenario.dataset_id);
  return {
    method,
    scenario,
    entities: document.model.entities.filter((e) => visible.has(e.id)).map((e) => ({ ...subset(["id", "attributes", "primary_key", "unique_keys", "constraints", "condition", "role"], e), attributes: e.attributes.map((a) => subset(["name", "type", "required"], a)) })),
    relationships: document.model.relationships.filter((r) => visible.has(r.from.entity_id) && visible.has(r.to.entity_id)),
    rules: document.rules.filter((r) => r.scenario_ids.includes(scenarioId)),
    decisions: document.decisions.filter((d) => d.requirement_ids.some((id) => scenario.requirement_ids.includes(id))),
    rows: Object.fromEntries([...visible].sort().map((id) => [id, dataset.rows[id] || []]))
  };
}
async function observationFingerprint(document, scenarioId, method) {
  return fingerprint(observationInput(document, scenarioId, method));
}
async function validateDocument(document) {
  if (!document || document.version !== "2.0.0") fail("version", "Only model document 2.0.0 is supported");
  if (!validateModel(document)) fail("schema", validateModel.errors?.[0]?.instancePath || "/");
  function depth(value, level = 0) {
    if (level > 80) fail("depth", "Maximum nesting is 80");
    if (value && typeof value === "object") for (const child of Object.values(value)) depth(child, level + 1);
  }
  depth(document);
  typed(document);
  if (new Blob([JSON.stringify(document, null, 2) + "\n"]).size > MAX_BYTES) fail("file_size", "Formatted JSON exceeds 20MB");
  const collections = { ...subset(["requirements", "rules", "decisions", "issues", "sources", "assumptions", "limitations"], document), ...document.model, ...document.samples, changes: document.change_impact.changes };
  const maps = {}, ids = /* @__PURE__ */ new Set();
  for (const [name, items] of Object.entries(collections)) {
    maps[name] = /* @__PURE__ */ new Map();
    for (const item of items) {
      if (ids.has(item.id)) fail("duplicate_id", item.id);
      ids.add(item.id);
      maps[name].set(item.id, item);
    }
  }
  const refs = (item, field, target) => {
    for (const id of item[field] || []) if (!maps[target].has(id)) fail("reference", (item.id || "") + "/" + field + "/" + id);
  };
  const targets = { requirement_ids: "requirements", entity_ids: "entities", source_ids: "sources", decision_ids: "decisions", scenario_ids: "scenarios", issue_ids: "issues" };
  for (const items of Object.values(collections)) for (const item of items) for (const [field, target] of Object.entries(targets)) refs(item, field, target);
  const entities = maps.entities;
  for (const e of entities.values()) {
    const names = e.attributes.map((a) => a.name);
    if (new Set(names).size !== names.length) fail("attribute_duplicate", e.id);
    if ((e.display_attributes || []).some((name) => !names.includes(name))) fail("display_attribute", e.id);
    for (const fields of [e.primary_key, ...e.unique_keys]) if (fields.some((f) => !names.includes(f))) fail("key_attribute", e.id);
    if (new Set(e.unique_keys.map(key)).size !== e.unique_keys.length) fail("unique_duplicate", e.id);
  }
  for (const domain of maps.domains.values()) if (domain.id === "all") fail("reserved_id", "all");
  for (const r of maps.relationships.values()) {
    for (const side of ["from", "to"]) {
      const endpoint = r[side], e = entities.get(endpoint.entity_id);
      if (!e || endpoint.attributes.some((f) => !e.attributes.some((a2) => a2.name === f))) fail("relationship_endpoint", r.id);
    }
    const a = r.from, b = r.to;
    if (r.foreign_key) {
      if (!a.attributes.length || a.attributes.length !== b.attributes.length) fail("foreign_key_arity", r.id);
      const parent = entities.get(b.entity_id);
      if (![parent.primary_key, ...parent.unique_keys].some((fields) => same(fields, b.attributes))) fail("foreign_key_unique", r.id);
    }
  }
  for (const dataset of maps.datasets.values()) {
    for (const [eid, rows] of Object.entries(dataset.rows)) {
      const e = entities.get(eid);
      if (!e) fail("dataset_entity", dataset.id + "/" + eid);
      const attrs = new Map(e.attributes.map((a) => [a.name, a]));
      for (const row of rows) {
        if (Object.keys(row).some((k) => !attrs.has(k))) fail("sample_attribute", dataset.id + "/" + eid);
        for (const [name, a] of attrs) if ((a.required || e.primary_key.includes(name)) && row[name] == null) fail("sample_required", dataset.id + "/" + eid + "/" + name);
        for (const name of e.primary_key) if (typeof row[name] === "object") fail("sample_primary_scalar", dataset.id + "/" + eid);
      }
      for (const fields of [e.primary_key, ...e.unique_keys]) {
        if (!fields.length) continue;
        const keys = rows.filter((r) => fields.every((f) => r[f] != null)).map((r) => key(fields.map((f) => r[f])));
        if (new Set(keys).size !== keys.length) fail("sample_duplicate", dataset.id + "/" + eid + "/" + fields.join(","));
      }
    }
    for (const r of maps.relationships.values()) {
      if (!r.foreign_key) continue;
      const a = r.from, b = r.to;
      const parents = new Set((dataset.rows[b.entity_id] || []).filter((row) => b.attributes.every((f) => row[f] != null)).map((row) => key(b.attributes.map((f) => row[f]))));
      for (const row of dataset.rows[a.entity_id] || []) {
        if (a.attributes.some((f) => row[f] == null)) continue;
        if (!parents.has(key(a.attributes.map((f) => row[f])))) fail("sample_foreign_key", dataset.id + "/" + r.id);
      }
    }
  }
  for (const scenario of maps.scenarios.values()) {
    const dataset = maps.datasets.get(scenario.dataset_id);
    if (!dataset || !scenario.requirement_ids.length) fail("scenario_dataset", scenario.id);
    for (const ref of scenario.sample_refs) {
      const eid = ref.entity_id;
      if (!scenario.entity_ids.includes(eid)) fail("sample_reference_entity", scenario.id);
      const pk = entities.get(eid).primary_key;
      if (!pk.length || pk.length !== Object.keys(ref.key).length || pk.some((k) => !Object.hasOwn(ref.key, k))) fail("sample_reference_key", scenario.id);
      if ((dataset.rows[eid] || []).filter((row) => pk.every((k) => Object.hasOwn(row, k) && same(row[k], ref.key[k]))).length !== 1) fail("sample_reference_row", scenario.id);
    }
  }
  for (const r of maps.rules.values()) {
    if (r.design_status === "modeled") {
      const covered = new Set(r.scenario_ids.flatMap((id) => maps.scenarios.get(id).requirement_ids));
      if (!r.requirement_ids.length || !r.scenario_ids.length || r.requirement_ids.some((id) => !covered.has(id))) fail("rule_coverage", r.id);
    }
    if (["unmodeled", "excluded", "not_applicable"].includes(r.design_status) && !r.reason) fail("rule_reason", r.id);
    if ((r.agreement_status === "open" || ["unmodeled", "excluded"].includes(r.design_status)) && !r.issue_ids.length) fail("rule_issue", r.id);
    if (r.agreement_status === "open" && r.issue_ids.some((id) => maps.issues.get(id).kind === "verification")) fail("rule_policy", r.id);
  }
  for (const d of maps.decisions.values()) {
    const choices = d.choices.map((c) => c.id);
    if (new Set(choices).size !== choices.length || !choices.includes(d.selected_choice) && d.status !== "open" || Object.hasOwn(d, "selected_choice") && !choices.includes(d.selected_choice)) fail("decision_choice", d.id);
  }
  const notes = /* @__PURE__ */ new Set([...maps.assumptions.keys(), ...maps.limitations.keys(), ...maps.issues.keys()]);
  const impact = document.change_impact, seenAreas = /* @__PURE__ */ new Set();
  for (const item of impact.areas) {
    refs(item, "entity_ids", "entities");
    refs(item, "issue_ids", "issues");
    if (seenAreas.has(item.area) || !notes.has(item.note_id)) fail("impact_note", item.area);
    seenAreas.add(item.area);
    if (item.status === "affected" && !item.entity_ids.length) fail("impact_target", item.area);
    if (item.status === "unknown" && !item.issue_ids.length) fail("impact_issue", item.area);
    if (impact.baseline.kind === "unknown" && item.status === "unaffected") fail("impact_baseline", item.area);
  }
  for (const c of impact.changes) {
    let target;
    if (c.target_type === "relationship") target = maps.relationships.get(c.relationship_id);
    else {
      target = entities.get(c.entity_id);
      if (c.target_type === "attribute") target = target?.attributes.find((a) => a.name === c.attribute_name);
    }
    if (c.change === "removed") {
      if (target || c.after !== null || !c.before || !Object.keys(c.before).length) fail("change_removed", c.id);
    } else if (!target || !c.after || !Object.keys(c.after).length || Object.entries(c.after).some(([k, v]) => !Object.hasOwn(target, k) || !same(v, target[k]))) fail("change_after", c.id);
    if (c.change === "added" && c.before !== null) fail("change_before", c.id);
    if (c.change === "modified" && (!c.before || !Object.keys(c.before).length)) fail("change_before", c.id);
  }
  const diagram = document.document.overview.diagram, nodeIds = diagram.nodes.map((n) => n.id);
  if (new Set(nodeIds).size !== nodeIds.length || diagram.links.some((e) => !nodeIds.includes(e.from) || !nodeIds.includes(e.to))) fail("overview_link", "document/overview/diagram");
  const seen = /* @__PURE__ */ new Set();
  for (const o of document.observations) {
    if (!maps.scenarios.has(o.scenario_id) || seen.has(o.scenario_id)) fail("observation_scenario", o.scenario_id);
    seen.add(o.scenario_id);
    if (o.input_fingerprint !== await observationFingerprint(document, o.scenario_id, o.method)) fail("observation_stale", o.scenario_id);
  }
  const warnings = [], warn = (code, path, message) => warnings.push({ code, path, message });
  for (const r of document.requirements) if (!document.samples.scenarios.some((s) => s.requirement_ids.includes(r.id))) warn("requirement_without_scenario", r.id, "확인할 상황이 연결되지 않았습니다.");
  if (document.document.complexity.level === "complex") {
    for (const topic of topics.filter((t) => !document.rules.some((r) => r.topic === t)).sort()) warn("rule_topic_unreviewed", topic, "관련 업무 규칙을 검토하거나 해당 없음의 이유를 남기세요.");
    if (!document.decisions.length) warn("alternatives_uncompared", "decisions", "주요 선택의 대안을 비교하세요.");
  }
  if (impact.baseline.kind !== "new") for (const area of areas.filter((a) => !seenAreas.has(a)).sort()) warn("impact_area_unreviewed", area, "변경 영향의 검토가 빠져 있습니다.");
  return { valid: true, version: document.version, warnings, scope: "형식·참조·샘플·결과 대응 검사이며 업무 합의나 운영 구현 확인이 아닙니다." };
}
export {
  observationFingerprint,
  observationInput,
  validateDocument
};
