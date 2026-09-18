import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
export interface SuppressSessionInput {
    sessionId: string;
    host: string;
    reason?: string;
}
export declare class SuppressSession {
    private readonly git;
    private readonly storeFactory;
    private readonly runtimeFactory;
    private readonly clock;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, runtimeFactory: (root: string) => RuntimeStorePort, clock: ClockPort);
    execute(cwd: string, input: SuppressSessionInput): Promise<void>;
}
