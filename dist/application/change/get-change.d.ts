import type { Change } from "../../domain/change/change.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
export declare class GetChange {
    private readonly git;
    private readonly storeFactory;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort);
    execute(cwd: string, changeId: string): Promise<Change>;
}
