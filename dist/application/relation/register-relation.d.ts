import type { Relation, RelationRouting, RelationType } from "../../domain/relation/relation.js";
import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { IdGeneratorPort } from "../../ports/id-generator.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
export interface RegisterRelationInput {
    from: string;
    to: string;
    type: RelationType;
    routing?: RelationRouting;
}
export interface RegisterRelationResult {
    relation: Relation;
    created: boolean;
}
export declare class RegisterRelation {
    private readonly git;
    private readonly storeFactory;
    private readonly clock;
    private readonly ids;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, clock: ClockPort, ids: IdGeneratorPort);
    execute(cwd: string, input: RegisterRelationInput): Promise<RegisterRelationResult>;
}
