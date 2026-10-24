import { key } from "./fingerprint.js";
import { text } from "./dom.js";

const sampleValue = (value) => value === undefined ? "(미제공)" : value === "" ? "(빈 문자열)" : text(value);

// Match the complete typed FK tuple in this dataset, never a partial or cross-dataset key.
function referenceRow(doc, dataset, relationship, row) {
  const { from, to } = relationship;
  if (!relationship.foreign_key || from.attributes.some((a) => row[a] == null)) return null;
  const parents = (dataset.rows[to.entity_id] || []).filter((parent) =>
    to.attributes.every((a) => parent[a] != null) && key(from.attributes.map((a) => row[a])) === key(to.attributes.map((a) => parent[a])));
  if (parents.length !== 1) return null;
  return { entity: doc.model.entities.find((e) => e.id === to.entity_id), row: parents[0] };
}

function sampleLabel(doc, dataset, entity, row, depth = 0) {
  const fields = entity.display_attributes || entity.attributes.filter((a) =>
    !entity.primary_key.includes(a.name) && /name|title|label|이름|명칭|제목/i.test(a.name + " " + a.label)).slice(0, 1).map((a) => a.name);
  return fields.map((field) => {
    if (row[field] == null || row[field] === "") return "";
    if (depth < 1) {
      const relationships = doc.model.relationships.filter((r) => r.from.entity_id === entity.id && r.from.attributes[0] === field);
      for (const relationship of relationships) {
        const target = referenceRow(doc, dataset, relationship, row);
        if (target) {
          const label = sampleLabel(doc, dataset, target.entity, target.row, depth + 1);
          if (label) return label;
        }
      }
    }
    return text(row[field]);
  }).filter(Boolean).join(" · ");
}

export { sampleValue, referenceRow, sampleLabel };
