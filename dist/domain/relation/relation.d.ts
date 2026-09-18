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
export declare function assertRelationInvariant(relation: Relation): void;
