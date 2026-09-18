import type { Relation } from "../../domain/relation/relation.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
export declare class ListRelations {
    private readonly git;
    private readonly storeFactory;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort);
    execute(cwd: string, nodeId?: string): Promise<Relation[]>;
}
