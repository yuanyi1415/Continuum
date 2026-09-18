import type { ArtifactRef } from "../../domain/artifact/artifact-ref.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
export declare class ListArtifacts {
    private readonly git;
    private readonly storeFactory;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort);
    execute(cwd: string): Promise<ArtifactRef[]>;
}
