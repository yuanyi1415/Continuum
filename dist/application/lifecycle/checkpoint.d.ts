import type { GitPort } from "../../ports/git.js";
import type { ProjectStorePort } from "../../ports/project-store.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
import type { ReconcileWork, ReconcileWorkResult } from "../reconcile/reconcile-work.js";
export interface LifecycleCheckpointInput {
    source: string;
    sessionId?: string;
    host?: string;
}
export interface LifecycleCheckpointResult {
    status: "NOOP" | "SUPPRESSED" | "UNMANAGED" | "RECONCILED";
    source: string;
    reconcile?: ReconcileWorkResult;
}
export declare class LifecycleCheckpoint {
    private readonly git;
    private readonly storeFactory;
    private readonly runtimeFactory;
    private readonly reconcileWork;
    constructor(git: GitPort, storeFactory: (root: string) => ProjectStorePort, runtimeFactory: (root: string) => RuntimeStorePort, reconcileWork: ReconcileWork);
    execute(cwd: string, input: LifecycleCheckpointInput): Promise<LifecycleCheckpointResult>;
}
