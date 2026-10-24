/* Valid documents that reproduced the previous rendering failures. */
function historicalRoleDocument(source, value = { toString: null }) {
  const doc = structuredClone(source), entity = doc.model.entities[0];
  doc.change_impact.baseline = { kind: "design_document", description: "변경 전 설계 값의 형식이 현재와 다른 비교 사례" };
  doc.change_impact.changes = [{ id: "CH-ROLE-OBJECT", target_type: "entity", entity_id: entity.id, change: "modified", before: { role: value }, after: { role: entity.role }, reason: "변경 전 설계의 기록을 형식이 달라도 보존한다.", requirement_ids: [] }];
  return doc;
}
function redundantTargetDocument(source) {
  const doc = structuredClone(source);
  doc.change_impact.changes[0].relationship_id = doc.model.relationships[0].id;
  return doc;
}
export { historicalRoleDocument, redundantTargetDocument };
