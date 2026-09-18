import type { WorkBinding } from "../../domain/work/work-binding.js";
import type { ClockPort } from "../../ports/clock.js";
import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
export interface GetCurrentWorkInput {
    sessionId?: string;
    host?: string;
}
export interface CurrentWorkResult {
    mode: "aware" | "managed";
    suppressed: boolean;
    binding: WorkBinding | null;
    sessionBound: boolean;
}
export declare class GetCurrentWork {
    private readonly git;
    private readonly storeFactory;
    private readonly runtimeFactory;
    private readonly clock;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, runtimeFactory: (root: string) => RuntimeStorePort, clock: ClockPort);
    execute(cwd: string, input?: GetCurrentWorkInput): Promise<CurrentWorkResult>;
}
