const fail = (message) => {
  throw new Error(message);
};
const MAX_BYTES = 20 * 1024 * 1024;
function parse(source) {
  if (source.charCodeAt(0) === 65279) source = source.slice(1);
  let at = 0;
  const ws = () => {
    while (/[\x20\t\r\n]/.test(source[at] || "!")) at++;
  };
  function string() {
    const start = at++;
    let escaped = false;
    while (at < source.length) {
      const ch = source[at++];
      if (!escaped && ch === '"') return JSON.parse(source.slice(start, at));
      if (!escaped && ch === "\\") escaped = true;
      else escaped = false;
    }
    fail("문자열이 끝나지 않은 JSON입니다.");
  }
  function value(depth) {
    if (depth > 80) fail("데이터가 너무 깊게 중첩되어 있습니다.");
    ws();
    const ch = source[at];
    if (ch === '"') return string();
    if (ch === "{") {
      at++;
      const out = /* @__PURE__ */ Object.create(null);
      ws();
      if (source[at] === "}") {
        at++;
        return out;
      }
      while (at < source.length) {
        ws();
        if (source[at] !== '"') fail("JSON 항목 이름을 읽을 수 없습니다.");
        const key = string();
        if (Object.hasOwn(out, key)) fail("같은 항목 이름이 중복되었습니다: " + key);
        ws();
        if (source[at++] !== ":") fail("JSON 구분자가 잘못되었습니다.");
        out[key] = value(depth + 1);
        ws();
        const end = source[at++];
        if (end === "}") return out;
        if (end !== ",") break;
      }
      fail("JSON 객체 형식이 잘못되었습니다.");
    }
    if (ch === "[") {
      at++;
      const out = [];
      ws();
      if (source[at] === "]") {
        at++;
        return out;
      }
      while (at < source.length) {
        out.push(value(depth + 1));
        ws();
        const end = source[at++];
        if (end === "]") return out;
        if (end !== ",") break;
      }
      fail("JSON 배열 형식이 잘못되었습니다.");
    }
    for (const [token, result2] of [["true", true], ["false", false], ["null", null]]) if (source.startsWith(token, at)) {
      at += token.length;
      return result2;
    }
    const match = source.slice(at).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (match) {
      at += match[0].length;
      const n = Number(match[0]);
      if (!Number.isFinite(n) || Number.isInteger(n) && !Number.isSafeInteger(n)) fail("정확하게 표시할 수 없는 숫자입니다. 큰 식별자는 문자열로 저장해 주세요.");
      return n;
    }
    fail("올바른 JSON 파일이 아닙니다.");
  }
  const result = value(0);
  ws();
  if (at !== source.length) fail("JSON 뒤에 불필요한 내용이 있습니다.");
  return result;
}
export {
  MAX_BYTES,
  parse
};
