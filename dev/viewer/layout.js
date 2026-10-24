/* Pure DOT generation is shared by runtime and ERD tests. */
const quote = (value) => JSON.stringify(String(value));
const xml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function wrap(value, size = 28) {
  const chars = Array.from(String(value));
  const parts = [];
  while (chars.length) parts.push(xml(chars.splice(0, size).join("")));
  return parts.join('<BR ALIGN="LEFT"/>');
}
function keyLabel(entity, relationships, context = false) {
  const keys = /* @__PURE__ */ new Map();
  for (const name of entity.primary_key) keys.set(name, /* @__PURE__ */ new Set(["PK"]));
  for (const r of relationships) if (r.foreign_key && r.from.entity_id === entity.id) for (const name of r.from.attributes) {
    if (!keys.has(name)) keys.set(name, /* @__PURE__ */ new Set());
    keys.get(name).add("FK");
  }
  const color = context ? "#eef1f5" : "#e7f0f9";
  let label = `<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="7" COLOR="#b9cbdc" BGCOLOR="white"><TR><TD ALIGN="LEFT" COLSPAN="2" BGCOLOR="${color}"><FONT POINT-SIZE="15"><B>${wrap(entity.name)}</B></FONT><BR ALIGN="LEFT"/><FONT COLOR="#5f7387">${xml(entity.id)}${context ? " · 연결 대상" : ""}</FONT></TD></TR>`;
  for (const [name, tags] of keys) {
    const attribute = entity.attributes.find((a) => a.name === name);
    label += `<TR><TD ALIGN="LEFT">${[...tags].join(" ")}</TD><TD ALIGN="LEFT">${wrap(attribute.label)}<BR ALIGN="LEFT"/><FONT COLOR="#647a91">${wrap(name)}</FONT></TD></TR>`;
  }
  if (!keys.size) label += '<TR><TD COLSPAN="2">구분·연결 값 미정의</TD></TR>';
  return label + "</TABLE>";
}
function candidateDots(scope) {
  const entities = scope.entities, rs = scope.relationships, byId = new Map(entities.map((e) => [e.id, e]));
  const groupOf = (id) => byId.get(id)?.group || "업무 모델";
  const groups = [...new Set(entities.map((e) => groupOf(e.id)))];
  const neighbors = new Map(entities.map((e) => [e.id, /* @__PURE__ */ new Set()]));
  for (const r of rs) {
    neighbors.get(r.from.entity_id).add(r.to.entity_id);
    neighbors.get(r.to.entity_id).add(r.from.entity_id);
  }
  const hubs = new Set(entities.filter((e) => neighbors.get(e.id).size >= 4 || new Set([...neighbors.get(e.id)].map(groupOf).filter((g) => g !== groupOf(e.id))).size >= 2).map((e) => e.id));
  const component = new Map(entities.map((e) => [e.id, e.id]));
  function root(id) {
    while (component.get(id) !== id) id = component.get(id);
    return id;
  }
  for (const r of rs) if (groupOf(r.from.entity_id) === groupOf(r.to.entity_id) && !hubs.has(r.from.entity_id) && !hubs.has(r.to.entity_id)) component.set(root(r.from.entity_id), root(r.to.entity_id));
  const parents = new Map(groups.map((g) => [g, /* @__PURE__ */ new Set()]));
  for (const r of rs) if (groupOf(r.from.entity_id) !== groupOf(r.to.entity_id)) parents.get(groupOf(r.from.entity_id)).add(groupOf(r.to.entity_id));
  const buckets = /* @__PURE__ */ new Map();
  for (const group of groups) {
    const key = JSON.stringify([...parents.get(group)].sort());
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(group);
  }
  const siblingBuckets = /* @__PURE__ */ new Map();
  for (const e of entities) {
    const parentIds = [...new Set(rs.filter((r) => r.from.entity_id === e.id).map((r) => r.to.entity_id))].sort();
    if (!parentIds.length) continue;
    const key = JSON.stringify([groupOf(e.id), parentIds]);
    if (!siblingBuckets.has(key)) siblingBuckets.set(key, []);
    siblingBuckets.get(key).push(e.id);
  }
  const siblingCount = Math.max(1, ...[...buckets.values(), ...siblingBuckets.values()].map((b) => b.length));
  const candidates = /* @__PURE__ */ new Set();
  for (const grouping of ["neighborhood", "group"]) {
    const packs = /* @__PURE__ */ new Map();
    for (const e of entities) {
      const key = grouping === "neighborhood" ? JSON.stringify([groupOf(e.id), root(e.id)]) : groupOf(e.id);
      if (!packs.has(key)) packs.set(key, { name: groupOf(e.id), members: [] });
      packs.get(key).members.push(e);
    }
    const nodes = [...packs.values()].map((pack, i) => `subgraph cluster_${i} {label=${quote(pack.name)};style="rounded";color="#a9bfd4";margin=8;${pack.members.map((e) => `${quote(e.id)} [id=${quote("node-" + e.id)},label=<${keyLabel(e, scope.allRelationships || rs, scope.context.has(e.id))}>];`).join("\n")}}`).join("\n");
    for (const columns of [.../* @__PURE__ */ new Set([1, Math.min(2, siblingCount), Math.min(4, siblingCount)])]) {
      let arrange = function(ids, spacing) {
        ids.forEach((id, i) => {
          spacing.set(id, i % columns + 1);
          if (i % columns > 0) hints.push(`${quote(ids[i - 1])} -> ${quote(id)} [style=invis,weight=4];`);
        });
      };
      const groupSpacing = /* @__PURE__ */ new Map(), nodeSpacing = /* @__PURE__ */ new Map(), hints = [];
      for (const bucket of buckets.values()) if (bucket.length > 1) {
        bucket.forEach((g, i) => groupSpacing.set(g, i % columns + 1));
        arrange(bucket.map((g) => entities.find((e) => groupOf(e.id) === g && rs.some((r) => r.from.entity_id === e.id && groupOf(r.to.entity_id) !== g))?.id || entities.find((e) => groupOf(e.id) === g).id), /* @__PURE__ */ new Map());
      }
      for (const bucket of siblingBuckets.values()) if (bucket.length > 1) arrange(bucket, nodeSpacing);
      const edges = rs.map((r) => `${quote(r.to.entity_id)} -> ${quote(r.from.entity_id)} [id=${quote("edge-" + r.id)},label=${quote(r.to.cardinality + " → " + r.from.cardinality)},minlen=${Math.max(nodeSpacing.get(r.from.entity_id) || 1, groupOf(r.from.entity_id) !== groupOf(r.to.entity_id) ? groupSpacing.get(groupOf(r.from.entity_id)) || 1 : 1)}];`).join("\n");
      candidates.add(`digraph Model {graph [rankdir=LR,compound=true,newrank=true,bgcolor="transparent",nodesep=.24,ranksep=.32,splines=polyline,pad=.12,outputorder=edgesfirst];node [shape=plain,fontname="Arial",fontsize=12];edge [fontname="Arial",fontsize=11,color="#839bb2",fontcolor="#456381",arrowsize=.65];${nodes}
${edges}
${hints.join("\n")}}`);
    }
  }
  return [...candidates];
}
function renderLayout(viz, scope, width, height) {
  const probe = document.createElement("div");
  probe.className = "layout-probe";
  probe.inert = true;
  probe.setAttribute("aria-hidden", "true");
  document.body.append(probe);
  let best = null, bestScore = -Infinity, lastError = null;
  try {
    for (const dot of candidateDots(scope)) {
      try {
        const svg = viz.renderSVGElement(dot, { engine: "dot" });
        probe.replaceChildren(svg);
        const box = svg.viewBox.baseVal, nodes = [...svg.querySelectorAll(".node")].map((n) => n.getBBox());
        if (nodes.some((a, i) => nodes.slice(i + 1).some((b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1))) continue;
        const area = nodes.reduce((s, n) => s + n.width * n.height, 0), meanSize = nodes.reduce((s, n) => s + Math.hypot(n.width, n.height), 0) / Math.max(1, nodes.length);
        const paths = [...svg.querySelectorAll(".edge path")], length = paths.reduce((s, p) => s + p.getTotalLength(), 0) / Math.max(1, paths.length);
        const fit = Math.min(1, width / box.width, height / box.height), occupancy = Math.min(1, area / (box.width * box.height));
        const score = fit * (0.8 + 0.2 * Math.sqrt(occupancy)) * (0.9 + 0.1 * Math.min(1, box.width / box.height / 1.25)) / (1 + 0.12 * length / Math.max(1, meanSize));
        if (score > bestScore) {
          best = svg;
          bestScore = score;
        }
      } catch (error) {
        lastError = error;
      }
    }
  } finally {
    probe.remove();
  }
  if (!best) throw lastError || new Error("ERD 배치를 만들지 못했습니다.");
  return best;
}
export {
  candidateDots,
  keyLabel,
  quote,
  renderLayout
};
