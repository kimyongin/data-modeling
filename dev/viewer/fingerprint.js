/* Typed JSON hash shared with Python fingerprint.py. */
const fail = (code, detail = "") => {
  throw new Error(code + (detail ? ": " + detail : ""));
};
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
function typed(value) {
  if (value === null) return ["n"];
  if (typeof value === "boolean") return ["b", value];
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value)) fail("unsafe_number");
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value === 0 ? 0 : value, false);
    return ["d", hex(bytes)];
  }
  if (typeof value === "string") {
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c >= 55296 && c <= 56319) {
        const next = value.charCodeAt(++i);
        if (!(next >= 56320 && next <= 57343)) fail("invalid_unicode");
      } else if (c >= 56320 && c <= 57343) fail("invalid_unicode");
    }
    return ["s", hex(new TextEncoder().encode(value))];
  }
  if (Array.isArray(value)) return ["a", value.map(typed)];
  if (value && typeof value === "object") return ["o", Object.keys(value).map((k) => [typed(k)[1], typed(value[k])]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)];
  fail("invalid_json_value");
}
const key = (value) => JSON.stringify(typed(value));
async function fingerprint(review) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key(review)));
  return "sha256:" + hex(new Uint8Array(hash));
}
export {
  fingerprint,
  key,
  typed
};
