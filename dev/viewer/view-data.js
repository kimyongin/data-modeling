/* Query the canonical document. UI projections contain no second copy of authored prose. */
function specData(document, requirementId) {
  const requirement = document.requirements.find((r) => r.id === requirementId);
  const applies = (item) => requirementId ? (item.requirement_ids || []).includes(requirementId) : (item.requirement_ids || []).length !== 1;
  return { requirement, rules: document.rules.filter(applies), decisions: document.decisions.filter(applies), issues: document.issues.filter(applies), entities: document.model.entities.filter(applies) };
}
function scenarioData(document, scenarioId) {
  const scenario = document.samples.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return null;
  return { scenario, dataset: document.samples.datasets.find((d) => d.id === scenario.dataset_id), observation: document.observations.find((o) => o.scenario_id === scenarioId) || null };
}
function entityData(document, entityId) {
  const entity = document.model.entities.find((e) => e.id === entityId);
  if (!entity) return null;
  return {
    entity,
    relationships: document.model.relationships.filter((r) => [r.from.entity_id, r.to.entity_id].includes(entityId)),
    rules: document.rules.filter((r) => r.entity_ids.includes(entityId)),
    decisions: document.decisions.filter((d) => d.entity_ids.includes(entityId) || entity.decision_ids?.includes(d.id)),
    issues: document.issues.filter((q) => q.entity_ids.includes(entityId))
  };
}
function checkMatches(scenario, observation, query, status) {
  if (status === "recorded" && !observation || status === "unconfirmed" && observation) return false;
  const content = [scenario.id, scenario.title, scenario.situation, scenario.expected_behavior, scenario.why_it_matters, scenario.sample_note || ""].join(" ").toLocaleLowerCase();
  return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every((word) => content.includes(word));
}
const statusLabels = { modeled: "설계에 반영", unmodeled: "아직 미반영", excluded: "범위 제외", not_applicable: "해당 없음", proposed: "제안", agreed: "합의", open: "미결", pass: "확인", fail: "예상과 다름" };
export {
  entityData,
  checkMatches,
  scenarioData,
  specData,
  statusLabels
};
