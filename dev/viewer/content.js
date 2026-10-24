import { el, add, p, section, facts, bullets, references, sourceLink, table } from "./dom.js";
import { specData, scenarioData, entityData, statusLabels } from "./view-data.js";
import { quote } from "./layout.js";
import { sampleValue, referenceRow, sampleLabel } from "./samples.js";
import { renderImpact } from "./impact.js";
const methodLabels = { sample: "샘플 대조", simulation: "가정 시뮬레이션", implementation: "대상 구현 확인", manual: "수동 검토" };
function decisionCard(decision, compact = false) {
  const card = el("article", null, "decision-card");
  card.dataset.record = decision.id;
  add(card, el("h4", decision.id + ": " + decision.title), p(statusLabels[decision.status], "badge"), p(decision.rationale));
  if (compact) {
    const selected = decision.choices.find((choice) => choice.id === decision.selected_choice);
    add(card, facts([["선택한 안", selected?.title || "아직 정하지 않았습니다."], ["함께 감수할 점", selected?.cost]]));
    return card;
  }
  const choices = el("ul", null, "choices");
  for (const choice of decision.choices) {
    const item = el("li", null, choice.id === decision.selected_choice ? "selected-choice" : "");
    item.dataset.choice = choice.id;
    add(item, el("strong", (choice.id === decision.selected_choice ? "선택한 안 · " : "다른 안 · ") + choice.title), facts([["이점", choice.benefit], ["대가", choice.cost]]));
    choices.append(item);
  }
  add(card, choices, facts([["판단 기준", bullets(decision.criteria)], ["재검토 조건", decision.revisit_when], ["업무 예", decision.example], ["개발 참고", decision.technical_note]]));
  return card;
}
function ruleCard(rule, index) {
  const card = el("article", null, "rule-card");
  card.dataset.record = rule.id;
  add(card, el("h4", rule.id + ": " + rule.title), p(rule.statement), p(statusLabels[rule.design_status] + " · " + statusLabels[rule.agreement_status], "badge"));
  if (rule.reason) add(card, p(rule.reason, "muted"));
  if (rule.issue_ids.length) add(card, p("남은 쟁점", "caption"), references(rule.issue_ids, index));
  return card;
}
function issueCard(issue) {
  return add(el("article", null, "issue-card"), el("h4", issue.id + ": " + issue.title), facts([["결정할 질문", issue.question], ["선택지", bullets(issue.options)], ["제안", issue.recommendation], ["영향", issue.impact]]));
}
function renderSpec(doc, id, index) {
  const body = el("article", null, "record-body");
  if (id === "@scope") {
    add(body, el("h2", "범위와 전제"), section("목표와 범위", facts([["해결할 목표", doc.document.goal], ["범위", doc.document.scope], ["모델 수준", doc.document.level], ["검토 깊이", doc.document.complexity.reason]])));
    for (const [title, items] of [["가정", doc.assumptions], ["미확인 및 제한", doc.limitations]]) {
      const block2 = section(title);
      for (const item of items) add(block2, el("h4", item.id + ": " + item.title), p(item.description), item.impact ? p(item.impact) : null);
      body.append(block2);
    }
    return body;
  }
  const data = specData(doc, id === "@common" ? null : id), requirement = data.requirement;
  body.append(el("h2", requirement ? requirement.id + ": " + requirement.title : "공통 설계 판단"));
  const summary = section("요약", p(requirement?.description || "여러 요구사항에 걸치거나 아직 연결할 요구사항이 정해지지 않은 판단입니다."));
  const design = section("설계안");
  for (const rule of data.rules) design.append(ruleCard(rule, index));
  for (const decision of data.decisions) design.append(decisionCard(decision));
  if (data.entities.length) add(design, p("연결되는 모델", "caption"), references(data.entities.map((e) => e.id), index));
  if (requirement?.example) add(design, el("h4", "업무 예"), p(requirement.example, "example"));
  if (!data.rules.length && !data.decisions.length) design.append(p("구체적인 설계안이 아직 없습니다.", "muted"));
  const pending = section("남은 결정");
  for (const issue of data.issues) pending.append(issueCard(issue));
  if (!data.issues.length) pending.append(p("등록된 미결 사항이 없습니다."));
  add(body, summary, design, pending);
  return body;
}
function overviewDot(doc) {
  const diagram = doc.document.overview.diagram;
  return 'digraph Overview {graph [rankdir=LR,bgcolor="transparent",pad=.2,nodesep=.4,ranksep=.6];node [shape=box,style="rounded,filled",fillcolor="#eef5fc",color="#abc1d7",fontname="Arial",fontsize=18,margin=".18,.15"];edge [color="#7b96ae",fontname="Arial",fontsize=13];' + diagram.nodes.map((n) => quote(n.id) + " [label=" + quote(n.title + (n.description ? "\n" + n.description : "")) + "];").join("") + diagram.links.map((e) => quote(e.from) + " -> " + quote(e.to) + " [label=" + quote(e.label) + "];").join("") + "}";
}
function renderOverview(doc, engine, signal) {
  const overview = doc.document.overview, body = el("article", null, "overview");
  add(body, el("h2", "무엇을 해결하나요?"), p(doc.document.goal, "overview-goal"));
  const diagram = el("div", null, "overview-diagram");
  diagram.setAttribute("aria-label", "업무 정보가 연결되는 큰 그림");
  body.append(diagram);
  engine.then((viz) => {
    if (signal.aborted) return;
    try {
      const svg = viz.renderSVGElement(overviewDot(doc), { engine: "dot" });
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", overview.connection);
      diagram.replaceChildren(svg);
    } catch (error) {
      diagram.replaceChildren(p(overview.connection));
    }
  }).catch(() => diagram.replaceChildren(p(overview.connection)));
  add(body, p(overview.connection, "muted"), section("실제로는 이렇게 사용합니다", p(overview.example.situation), p(overview.example.outcome, "example")), section("남은 판단", p(overview.pending)));
  return body;
}
function renderReference(doc, id, index, options = {}) {
  const body = el("article", null, "record-body");
  if (id === "@changes") {
    const impact = renderImpact(doc.change_impact, index, options);
    add(body, el("h2", "설계 변경 기록"), p("스펙과 모델에는 최신 설계를 표시합니다. 이곳에서는 기준 설계와 이번 설계의 차이·영향을 확인합니다. 모든 버전의 누적 이력은 아닙니다.", "muted"), impact);
    body.dataset.searchText = impact.dataset.searchText || "";
    return body;
  }
  if (id === "@process") {
    add(body, el("h2", "제작 과정"), section("사용한 스킬과 절차", p(doc.document.process.skill), bullets(doc.document.process.steps)), section("확인한 범위", p(doc.document.process.scope)));
    return body;
  }
  if (id === "@glossary") {
    add(body, el("h2", "용어 안내"), table(["용어", "뜻"], [["모델·엔터티", "같은 종류의 정보를 관리하는 묶음입니다."], ["속성 / 행", "기록할 항목 / 실제 기록 한 건입니다."], ["PK / FK", "한 건을 구분하는 값 / 다른 정보와 연결하는 값입니다."], ["유일 조합 / UQ", "여러 항목을 함께 보았을 때 같은 값이 중복될 수 없는 범위입니다."], ["1 / 0..1 / 0..N / 1..N", "반드시 한 건 / 없거나 한 건 / 없거나 여러 건 / 한 건 이상이 연결된다는 뜻입니다."], ["연결 대상", "선택한 업무를 이해하기 위해 함께 보여주는 다른 영역의 모델입니다."], ["미제공 / 빈 문자열 / NULL", "항목 자체가 없음 / 길이가 0인 글자 값 / 명시적으로 비어 있는 값입니다. 서로 구별합니다."], ["설계 반영 / 합의", "모델에 표현했는지 / 업무 담당자가 동의했는지입니다. 서로 다릅니다."], ["샘플 확인 / 구현 확인", "합성 예시의 확인 / 실제 구현 환경에서 확인한 결과입니다."], ["미확인", "결과를 기록하지 않았습니다. 실패를 뜻하지 않습니다."]]));
    return body;
  }
  const source = doc.sources.find((s) => s.id === id);
  if (!source) return body;
  add(body, el("h2", index.label(id)), section("이 자료가 뒷받침하는 내용", p(source.claim)), section("확인 범위와 한계", source.reading_note ? p(source.reading_note) : null, p(source.limitation)), section("원문과 확인 시점", facts([["위치", source.location], ["확인일", source.checked_at], ["자료 버전", source.version]]), sourceLink(source.url)));
  return body;
}
function observationCard(doc, scenarioId) {
  const data = scenarioData(doc, scenarioId);
  if (!data) return null;
  const { scenario, observation } = data;
  const block = section("선택한 확인 사항", el("h4", scenario.id + ": " + scenario.title), facts([["상황", scenario.situation], ["기대 동작", scenario.expected_behavior], ["확인하는 이유", scenario.why_it_matters]]));
  if (observation) add(block, el("h4", "실제로 확인한 결과"), p(statusLabels[observation.status] + " · " + methodLabels[observation.method], "badge"), p(observation.message), facts([["확인 범위", observation.scope], ["확인일", observation.observed_at]]));
  else add(block, el("h4", "실제로 확인한 결과"), p("아직 확인한 결과가 기록되지 않았습니다. 기대 동작과 실제 결과는 구별해서 읽어 주세요.", "muted"));
  if (scenario.sample_note) block.append(p(scenario.sample_note, "muted"));
  return block;
}
function renderInspector(doc, entityId, detail, scope, index, focusedRelationship = null) {
  const body = el("div", null, "inspector-body"), data = entityData(doc, entityId);
  if (!data) return body;
  const { entity, relationships, rules, decisions, issues } = data;
  if (detail === "attributes") {
    add(body, section("모델의 역할", p(entity.description), facts([["한 줄의 의미", entity.grain], ["모델 역할", { core: "업무 핵심", supporting: "근거·운영 지원", optional: "조건부 확장" }[entity.role]], ["포함 조건", entity.condition]])));
    const attrs = section("기록할 항목");
    for (const a of entity.attributes) {
      const tags = [];
      if (entity.primary_key.includes(a.name)) tags.push("PK · 구분 값");
      if (relationships.some((r) => r.foreign_key && r.from.entity_id === entity.id && r.from.attributes.includes(a.name))) tags.push("FK · 연결 값");
      add(attrs, add(el("article", null, "attribute-card"), el("h4", a.label), p(a.name, "code"), p(a.description), p(tags.join(" / "), "badge"), p((a.required || entity.primary_key.includes(a.name) ? "반드시 입력" : "비워 둘 수 있음") + " · 저장 형식: " + a.type, "muted")));
    }
    body.append(attrs);
    if (entity.unique_keys.length) body.append(section("중복을 막는 범위", bullets(entity.unique_keys.map((fields) => fields.map((f) => entity.attributes.find((a) => a.name === f)?.label || f).join(" + ")))));
    if (entity.constraints?.length) body.append(section("추가 제약", bullets(entity.constraints)));
    if (entity.indexes?.length) body.append(section("조회 인덱스", bullets(entity.indexes)));
    if (relationships.length) {
      const conditions = section("연결 조건");
      for (const r of relationships) conditions.append(add(el("article", null, "relationship-condition"), el("h4", index.label(r.id)), facts([["지켜야 할 조건", r.rule], ["보장하는 위치", r.enforcement]])));
      body.append(conditions);
    }
  } else {
    if (scope.scenario) body.append(observationCard(doc, scope.scenario.id));
    body.append(section("이 모델이 필요한 이유", p(entity.description), entity.example ? p(entity.example, "example") : null));
    const applies = (item) => !scope.scenario || !item.requirement_ids.length || item.requirement_ids.some((id) => scope.scenario.requirement_ids.includes(id));
    const relevantDecisions = decisions.filter(applies);
    if (relevantDecisions.length) {
      const choices = section("설계 선택과 대가");
      for (const decision of relevantDecisions) choices.append(decisionCard(decision, true));
      body.append(choices);
    }
    if (entity.tradeoff) body.append(section("선택의 대가", p(entity.tradeoff)));
    const relevantRules = scope.scenario ? rules.filter((rule) => rule.scenario_ids.includes(scope.scenario.id)) : rules;
    if (relevantRules.length) {
      const block = section(scope.scenario ? "이번 확인에 적용한 규칙" : "적용한 업무 규칙");
      const list = el("ul", null, "model-rules");
      for (const rule of relevantRules) {
        const item = add(el("li"), el("strong", index.label(rule.id)), p(rule.statement), p(statusLabels[rule.design_status] + " · " + statusLabels[rule.agreement_status], "badge"));
        if (rule.reason) item.append(p(rule.reason, "muted"));
        list.append(item);
      }
      block.append(list);
      body.append(block);
    }
    const visibleRelationships = relationships.filter((r) => scope.relationships.some((visible) => visible.id === r.id));
    if (visibleRelationships.length) {
      const block = section("이 화면의 관계를 만든 이유");
      for (const r of [...visibleRelationships].sort((a, b) => Number(b.id === focusedRelationship) - Number(a.id === focusedRelationship))) {
        const card = add(el("article", null, "relationship-card"), el("h4", index.label(r.id)), p(r.description));
        card.dataset.relationship = r.id;
        block.append(card);
      }
      body.append(block);
    }
    const relevantIssues = issues.filter(applies);
    if (relevantIssues.length || entity.risk || entity.question) {
      const block = section("남은 판단");
      if (entity.risk) block.append(p(entity.risk));
      if (entity.question) block.append(p(entity.question));
      for (const q of relevantIssues) block.append(issueCard(q));
      body.append(block);
    }
    if (entity.source_ids.length) body.append(section("판단에 사용한 근거", references(entity.source_ids, index)));
  }
  return body;
}
function renderSamples(doc, entityId, scenarioId, datasetId) {
  const entity = doc.model.entities.find((e) => e.id === entityId), scenario = doc.samples.scenarios.find((s) => s.id === scenarioId), dataset = doc.samples.datasets.find((d) => d.id === (datasetId || scenario?.dataset_id)) || doc.samples.datasets[0];
  const body = el("div", null, "sample-content");
  if (!entity) return body;
  add(body, p(dataset.title + " · " + entity.name + " · " + (dataset.rows[entityId]?.length || 0) + "행", "caption"));
  const grid = table(entity.attributes.map((a) => a.label + "\n" + a.name), (dataset.rows[entityId] || []).map((row) => entity.attributes.map((a) => sampleValue(row[a.name]))));
  grid.classList.add("sample-grid");
  grid.tabIndex = 0;
  grid.setAttribute("role", "region");
  grid.setAttribute("aria-label", entity.name + " 전체 샘플 데이터. 위아래 및 좌우로 스크롤");
  const refs = scenario?.dataset_id === dataset.id ? scenario.sample_refs.filter((r) => r.entity_id === entityId) : [];
  if (refs.length) {
    const rows = grid.querySelectorAll("tbody tr");
    (dataset.rows[entityId] || []).forEach((row, i) => {
      if (refs.some((ref) => entity.primary_key.every((k) => JSON.stringify(ref.key[k]) === JSON.stringify(row[k])))) rows[i]?.classList.add("evidence");
    });
  }
  for (const [i, tr] of [...grid.querySelectorAll("tbody tr")].entries()) {
    const row = dataset.rows[entityId]?.[i];
    if (!row) continue;
    for (const relationship of doc.model.relationships.filter((r) => r.foreign_key && r.from.entity_id === entityId)) {
      const target = referenceRow(doc, dataset, relationship, row);
      if (!target) continue;
      const label = sampleLabel(doc, dataset, target.entity, target.row);
      if (!label) continue;
      const columnIndex = entity.attributes.findIndex((a) => a.name === relationship.from.attributes[0]), cell = tr.children[columnIndex];
      if (cell) cell.append(p(target.entity.name + " · " + label, "sample-reference"));
    }
  }
  add(body, grid);
  return body;
}
export {
  overviewDot,
  renderInspector,
  renderOverview,
  renderReference,
  renderSamples,
  renderSpec
};
