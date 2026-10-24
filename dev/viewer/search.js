/* All lists use literal AND matching; order and repeated whitespace do not matter. */
const normalize = (value) => String(value ?? "").normalize("NFC").toLocaleLowerCase();
function matchesQuery(content, query) {
  const haystack = normalize(content);
  return normalize(query).trim().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}
export { matchesQuery };
