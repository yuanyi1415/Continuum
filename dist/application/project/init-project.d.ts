import type { Project } from "../../domain/project/project.js";
import type { CurrentPointer, Snapshot } from "../../domain/snapshot/snapshot.js";
import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { IdGeneratorPort } from "../../ports/id-generator.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
import type { RepositoryFilesPort } from "../../ports/repository-files.js";
export interface InitProjectResult {
    project: Project;
    snapshot: Snapshot;
    current: CurrentPointer;
    repositoryRoot: string;
}
export declare class InitProject {
    private readonly git;
    private readonly storeFactory;
    private readonly runtimeFactory;
    private readonly repositoryFiles;
    private readonly clock;
    private readonly ids;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, runtimeFactory: (root: string) => RuntimeStorePort, repositoryFiles: RepositoryFilesPort, clock: ClockPort, ids: IdGeneratorPort);
    execute(cwd: string, name?: string): Promise<InitProjectResult>;
}
