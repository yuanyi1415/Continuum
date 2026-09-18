export type RelationType = "belongs_to" | "blocked_by" | "governed_by" | "domain_context" | "evidence" | "supersedes";
export type RelationRouting = "required" | "optional" | "historical";

export interface Relation {
  schemaVersion: 1;
  relationId: string;
  from: string;
  to: string;
  type: RelationType;
  routing: RelationRouting;
  createdAt: string;
}

export function assertRelationInvariant(relation: Relation): void {
  if (!relation.relationId.startsWith("rel_")) throw new Error("relationId must start with rel_");
  if (!relation.from.trim() || !relation.to.trim()) throw new Error("relation endpoints cannot be empty");
  if (relation.from === relation.to) throw new Error("relation cannot point to itself");
  if (!Number.isFinite(Date.parse(relation.createdAt))) throw new Error("relation createdAt must be ISO-8601");
}
