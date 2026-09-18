import type { Change, ChangeStatus } from "../../domain/change/change.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
export declare class ListChanges {
    private readonly git;
    private readonly storeFactory;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort);
    execute(cwd: string, status?: ChangeStatus): Promise<Change[]>;
}
