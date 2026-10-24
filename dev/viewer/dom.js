function el(tag, text2, cls) {
  const node = document.createElement(tag);
  if (text2 !== void 0 && text2 !== null) node.textContent = String(text2);
  if (cls) node.className = cls;
  return node;
}
function add(parent, ...nodes) {
  parent.append(...nodes.filter(Boolean));
  return parent;
}
function button(label, action, cls) {
  const node = el("button", label, cls);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}
function text(value) {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "예" : "아니오";
  return typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
}
function p(value, cls) {
  return el("p", value, cls);
}
function section(title, ...nodes) {
  return add(el("section", null, "content-section"), el("h3", title), ...nodes);
}
function bullets(values) {
  const list = el("ul");
  for (const value of values) list.append(el("li", value));
  return list;
}
function facts(values) {
  const list = el("dl", null, "facts");
  for (const [label, value] of values) if (value !== void 0 && value !== null && value !== "") add(list, el("dt", label), add(el("dd"), value instanceof Node ? value : p(text(value))));
  return list;
}
function table(headers, rows) {
  const grid = el("div", null, "table-scroll"), t = el("table"), head = el("thead"), body = el("tbody"), tr = el("tr");
  for (const name of headers) tr.append(el("th", name));
  head.append(tr);
  for (const row of rows) {
    const tr2 = el("tr");
    for (const value of row) tr2.append(el("td", text(value)));
    body.append(tr2);
  }
  if (!rows.length) {
    const td = el("td", "데이터 없음");
    td.colSpan = headers.length;
    body.append(add(el("tr"), td));
  }
  add(t, head, body);
  grid.append(t);
  return grid;
}
function tabs(items, current, select, label) {
  const nav = el("nav", null, "tabs");
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-label", label);
  items.forEach(([id, title], i) => {
    const b = button(title, () => select(id));
    b.dataset.tab = id;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(id === current));
    b.tabIndex = id === current ? 0 : -1;
    b.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (i + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
      const parent = nav.parentElement;
      select(items[next][0]);
      parent?.querySelector(`[data-tab="${items[next][0]}"]`)?.focus();
    });
    nav.append(b);
  });
  return nav;
}
function indexDocument(doc) {
  const items = [...doc.requirements, ...doc.rules, ...doc.decisions, ...doc.issues, ...doc.sources, ...doc.assumptions, ...doc.limitations, ...doc.model.entities, ...doc.model.relationships, ...doc.model.domains, ...doc.samples.scenarios, ...doc.samples.datasets];
  const index = new Map(items.map((item) => [item.id, item]));
  return { get: (id) => index.get(id), label: (id) => id + ": " + (index.get(id)?.title || index.get(id)?.name || "대상 미확인") };
}
function references(ids, index) {
  return p(ids.map((id) => index.label(id)).join(" · "), "references");
}
function sourceLink(url) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    const a = el("a", "원문 자료 열기 ↗");
    a.href = parsed.href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  } catch {
    return null;
  }
}
export {
  add,
  bullets,
  button,
  el,
  facts,
  indexDocument,
  p,
  references,
  section,
  sourceLink,
  table,
  tabs,
  text
};
