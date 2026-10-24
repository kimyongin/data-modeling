/* Shared pointer and keyboard resize behavior for both sidebars and sample drawer. */
function resizer(handle, { axis, bounds, get, set, reset, direction = 1, signal, label }) {
  handle.tabIndex = 0;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-label", label);
  handle.setAttribute("aria-orientation", axis === "x" ? "vertical" : "horizontal");
  let drag = null;
  const sync = () => {
    const { min, max } = bounds();
    handle.setAttribute("aria-valuemin", Math.round(min));
    handle.setAttribute("aria-valuemax", Math.round(max));
    handle.setAttribute("aria-valuenow", Math.round(get()));
  };
  const apply = (value) => {
    const { min, max } = bounds();
    set(Math.max(min, Math.min(max, value)));
    sync();
  };
  const end = () => {
    const old = drag;
    drag = null;
    handle.classList.remove("dragging");
    if (old && handle.hasPointerCapture(old.id)) handle.releasePointerCapture(old.id);
  };
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    drag = { id: event.pointerId, start: axis === "x" ? event.clientX : event.clientY, size: get() };
    handle.setPointerCapture(event.pointerId);
    handle.classList.add("dragging");
  }, { signal });
  handle.addEventListener("pointermove", (event) => {
    if (drag?.id === event.pointerId) apply(drag.size + direction * ((axis === "x" ? event.clientX : event.clientY) - drag.start));
  }, { signal });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) handle.addEventListener(type, end, { signal });
  handle.addEventListener("dblclick", () => {
    reset();
    sync();
  }, { signal });
  handle.addEventListener("keydown", (event) => {
    const negative = axis === "x" ? "ArrowLeft" : "ArrowUp", positive = axis === "x" ? "ArrowRight" : "ArrowDown";
    if (![negative, positive, "Home", "End", "Enter"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Enter") {
      reset();
      sync();
      return;
    }
    const { min, max } = bounds();
    apply(event.key === "Home" ? min : event.key === "End" ? max : get() + (event.key === negative ? -1 : 1) * direction * (event.shiftKey ? 80 : 24));
  }, { signal });
  signal?.addEventListener("abort", end, { once: true });
  return { sync };
}
export {
  resizer
};
