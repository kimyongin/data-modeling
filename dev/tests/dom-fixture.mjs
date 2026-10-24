/* Minimal DOM fixture for content/state tests. No CSS/layout or browser emulation claim. */
class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.style = { setProperty(k, v) {
      this[k] = v;
    } };
    this.listeners = {};
    this.className = "";
    this._text = "";
    this.scrollTop = 0;
    this.scrollLeft = 0;
    this.hidden = false;
    this.clientWidth = 1e3;
    this.clientHeight = 600;
    this.offsetTop = 0;
    this.viewBox = { baseVal: { x: 0, y: 0, width: 800, height: 400 } };
    this.classList = { add: (...names) => {
      this.className = [.../* @__PURE__ */ new Set([...this.className.split(" ").filter(Boolean), ...names])].join(" ");
    }, remove: (name) => {
      this.className = this.className.split(" ").filter((n) => n !== name).join(" ");
    }, toggle: (name, yes) => {
      if (yes === void 0) yes = !this.className.split(" ").includes(name);
      if (yes) this.classList.add(name);
      else this.classList.remove(name);
    } };
  }
  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }
  get firstChild() {
    return this.children[0] || null;
  }
  get id() {
    return this.attributes.id || "";
  }
  set id(value) {
    this.attributes.id = String(value);
  }
  get parentElement() {
    return this.parentNode || null;
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node.parentNode) node.remove();
      this.children.push(node);
      node.parentNode = this;
    }
  }
  replaceChildren(...nodes) {
    for (const old of this.children) old.parentNode = null;
    this.children = [];
    this._text = "";
    this.append(...nodes);
  }
  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
      this.parentNode = null;
    }
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "class") this.className = String(value);
    if (name.startsWith("data-")) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
  }
  getAttribute(name) {
    return name === "class" ? this.className : this.attributes[name] ?? null;
  }
  removeAttribute(name) {
    delete this.attributes[name];
  }
  addEventListener(type, fn, options = {}) {
    (this.listeners[type] ??= []).push(fn);
    options.signal?.addEventListener("abort", () => {
      this.listeners[type] = this.listeners[type].filter((f) => f !== fn);
    }, { once: true });
  }
  click() {
    this.emit("click");
  }
  emit(type, values = {}) {
    const event = { target: this, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; }, ...values };
    for (const fn of this.listeners[type] || []) fn(event);
    this["on" + type]?.(event);
    return event;
  }
  cloneNode(deep = false) {
    const clone = new Element(this.tagName);
    clone.attributes = { ...this.attributes };
    clone.dataset = { ...this.dataset };
    clone.className = this.className;
    clone._text = this._text;
    if (deep) clone.append(...this.children.map((c) => c.cloneNode(true)));
    return clone;
  }
  focus() {
    globalThis.document.activeElement = this;
  }
  contains(node) {
    return this === node || this.children.some((c) => c.contains(node));
  }
  matches(selector) {
    if (selector.startsWith(".")) return this.className.split(" ").includes(selector.slice(1));
    const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attr) {
      const value = attr[1].startsWith("data-") ? this.dataset[attr[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : this.getAttribute(attr[1]);
      return attr[2] === void 0 ? value !== void 0 && value !== null : value === attr[2];
    }
    return this.tagName === selector.toUpperCase();
  }
  querySelectorAll(selector) {
    const selectors = selector.split(" ");
    const output = [];
    function visit(node) {
      for (const child of node.children) {
        if (child.matches(selectors.at(-1))) {
          let p = child.parentNode, i = selectors.length - 2;
          while (p && i >= 0) {
            if (p.matches(selectors[i])) i--;
            p = p.parentNode;
          }
          if (i < 0) output.push(child);
        }
        visit(child);
      }
    }
    visit(this);
    return output;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  closest(selector) {
    for (let n = this; n; n = n.parentNode) if (n.matches(selector)) return n;
    return null;
  }
  getBoundingClientRect() {
    return { width: this.clientWidth, height: parseFloat(this.style.height) || this.clientHeight, x: 0, y: 0, left: 0, top: 0 };
  }
  setPointerCapture(id) {
    this.capture = id;
  }
  hasPointerCapture(id) {
    return this.capture === id;
  }
  releasePointerCapture() {
    this.capture = null;
  }
}
function installDOM() {
  globalThis.Node = Element;
  const body = new Element("body");
  globalThis.document = { body, activeElement: null, getElementById: (id) => body.querySelectorAll("[id]").find((n) => n.id === id), createElement: (tag) => new Element(tag), createElementNS: (_, tag) => new Element(tag) };
  const observers = new Set();
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; }
    observe() {
      if (!this.active) {
        this.active = true;
        observers.add(this);
      }
    }
    disconnect() {
      if (this.active) {
        observers.delete(this);
        this.active = false;
      }
    }
  };
  return { body, observers: () => observers.size, resize: () => [...observers].forEach((o) => o.callback([])) };
}
export {
  Element,
  installDOM
};
