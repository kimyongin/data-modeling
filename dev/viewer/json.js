const MAX_BYTES = 20 * 1024 * 1024;
function parse(source) {
  if (source.charCodeAt(0) === 65279) source = source.slice(1);
  let at = 0;
  const fail = (reason, code = "json_syntax", position = at, extra = {}) => {
    position = Math.min(position, source.length);
    const prefix = source.slice(0, position), breaks = prefix.match(/\r\n|\r|\n/g) || [];
    const lineStart = Math.max(prefix.lastIndexOf("\n"), prefix.lastIndexOf("\r")) + 1;
    const column = Array.from(prefix.slice(lineStart)).length + 1;
    throw Object.assign(new Error(reason), { code, details: { reason, line: breaks.length + 1, column, ...extra } });
  };
  const ws = () => {
    while (/[\x20\t\r\n]/.test(source[at] || "!")) at++;
  };
  function string() {
    const start = at++;
    while (at < source.length) {
      const ch = source[at++];
      if (ch === '"') return JSON.parse(source.slice(start, at));
      if (ch.charCodeAt(0) < 32) fail("문자열 안에 줄바꿈이나 제어 문자를 그대로 넣을 수 없습니다. 이스케이프 표기로 바꿔 주세요.", "json_syntax", at - 1);
      if (ch === "\\") {
        const escapeAt = at - 1, escaped = source[at++];
        if (escaped === "u") {
          for (let i = 0; i < 4; i++) {
            if (!/[0-9a-fA-F]/.test(source[at] || "!")) fail("유니코드 이스케이프에는 16진수 네 자리가 필요합니다.", "json_syntax", at);
            at++;
          }
        } else if (!escaped || !'"\\/bfnrt'.includes(escaped)) fail("문자열의 이스케이프 표기가 잘못되었습니다. 역슬래시 뒤에는 허용된 문자나 유니코드 표기를 써 주세요.", "json_syntax", escapeAt);
      }
    }
    fail("문자열이 끝나지 않은 JSON입니다.");
  }
  function value(depth) {
    if (depth > 80) fail("데이터가 너무 깊게 중첩되어 있습니다.", "depth");
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
        if (at >= source.length) fail("객체를 닫는 중괄호(})가 빠졌습니다.");
        if (source[at] !== '"') fail("항목 이름은 큰따옴표로 감싸 주세요.");
        const keyAt = at;
        const key = string();
        if (Object.hasOwn(out, key)) fail("같은 항목 이름이 중복되었습니다. 이름을 구분하거나 중복 항목을 제거해 주세요.", "json_syntax", keyAt, { duplicateKey: key.slice(0, 100) });
        ws();
        if (source[at] !== ":") fail("항목 이름과 값 사이에 콜론(:)이 필요합니다.");
        at++;
        out[key] = value(depth + 1);
        ws();
        if (source[at] === "}") { at++; return out; }
        if (source[at] !== ",") fail("항목 사이의 쉼표(,) 또는 닫는 중괄호(})가 필요합니다.");
        const commaAt = at++;
        ws();
        if (source[at] === "}") fail("마지막 항목 뒤의 쉼표(,)를 제거해 주세요.", "json_syntax", commaAt);
      }
      fail("객체를 닫는 중괄호(})가 빠졌습니다.");
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
        if (source[at] === "]") { at++; return out; }
        if (source[at] !== ",") fail("목록 항목 사이의 쉼표(,) 또는 닫는 대괄호(])가 필요합니다.");
        const commaAt = at++;
        ws();
        if (source[at] === "]") fail("마지막 목록 항목 뒤의 쉼표(,)를 제거해 주세요.", "json_syntax", commaAt);
      }
      fail("목록을 닫는 대괄호(])가 빠졌습니다.");
    }
    for (const [token, result2] of [["true", true], ["false", false], ["null", null]]) if (source.startsWith(token, at)) {
      at += token.length;
      return result2;
    }
    const match = source.slice(at).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (match) {
      at += match[0].length;
      const n = Number(match[0]);
      if (!Number.isFinite(n) || Number.isInteger(n) && !Number.isSafeInteger(n)) fail("정확하게 표시할 수 없는 숫자입니다. 큰 식별자는 문자열로 저장해 주세요.", "unsafe_number");
      return n;
    }
    fail("값을 읽을 수 없습니다. 문자열은 큰따옴표로 감싸고 숫자·true·false·null은 JSON 표기에 맞춰 주세요.");
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
