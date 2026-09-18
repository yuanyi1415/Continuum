import type { Change } from "../../domain/change/change.js";
import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { IdGeneratorPort } from "../../ports/id-generator.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
export declare class OpenChange {
    private readonly git;
    private readonly storeFactory;
    private readonly clock;
    private readonly ids;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, clock: ClockPort, ids: IdGeneratorPort);
    execute(cwd: string, title: string, intent?: string): Promise<Change>;
}
