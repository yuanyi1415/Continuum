import type { ArchiveCreateResult, ArchivePort } from "../../ports/archive.js";
import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { IdGeneratorPort } from "../../ports/id-generator.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
export interface ArchiveProjectInput {
    allowIncomplete?: boolean;
    withHistory?: boolean;
}
export declare class ArchiveProject {
    private readonly git;
    private readonly storeFactory;
    private readonly archive;
    private readonly clock;
    private readonly ids;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, archive: ArchivePort, clock: ClockPort, ids: IdGeneratorPort);
    execute(cwd: string, input?: ArchiveProjectInput): Promise<ArchiveCreateResult>;
}
